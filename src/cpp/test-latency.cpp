/**
 * C++ Latency Test for Polymarket
 *
 * Reads pre-signed order from stdin, spams POST requests with libcurl.
 * Outputs latency stats to stdout.
 *
 * Build: g++ -O3 -o dist/test-latency-cpp src/cpp/test-latency.cpp -lcurl
 * Usage: echo '{"url":"...","body":"...","headers":{...}}' | ./test-latency-cpp
 */

#include <curl/curl.h>
#include <iostream>
#include <sstream>
#include <string>
#include <chrono>
#include <vector>
#include <thread>
#include <algorithm>
#include <cstring>

// Configuration
const int DEFAULT_MAX_ATTEMPTS = 1000;
const int DEFAULT_INTERVAL_MS = 2;

// Response buffer
struct ResponseBuffer {
    std::string data;
};

// Curl write callback
static size_t writeCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    size_t totalSize = size * nmemb;
    ResponseBuffer* buf = static_cast<ResponseBuffer*>(userp);
    buf->data.append(static_cast<char*>(contents), totalSize);
    return totalSize;
}

// Simple JSON value extractor (no external JSON library needed)
std::string extractJsonString(const std::string& json, const std::string& key) {
    std::string searchKey = "\"" + key + "\"";
    size_t keyPos = json.find(searchKey);
    if (keyPos == std::string::npos) return "";

    size_t colonPos = json.find(':', keyPos);
    if (colonPos == std::string::npos) return "";

    size_t valueStart = json.find('"', colonPos);
    if (valueStart == std::string::npos) return "";
    valueStart++;

    size_t valueEnd = valueStart;
    while (valueEnd < json.length()) {
        if (json[valueEnd] == '"' && json[valueEnd - 1] != '\\') break;
        valueEnd++;
    }

    return json.substr(valueStart, valueEnd - valueStart);
}

int extractJsonInt(const std::string& json, const std::string& key, int defaultVal) {
    std::string searchKey = "\"" + key + "\"";
    size_t keyPos = json.find(searchKey);
    if (keyPos == std::string::npos) return defaultVal;

    size_t colonPos = json.find(':', keyPos);
    if (colonPos == std::string::npos) return defaultVal;

    size_t numStart = colonPos + 1;
    while (numStart < json.length() && (json[numStart] == ' ' || json[numStart] == '\t')) numStart++;

    return std::atoi(json.c_str() + numStart);
}

// Extract nested JSON object as string
std::string extractJsonObject(const std::string& json, const std::string& key) {
    std::string searchKey = "\"" + key + "\"";
    size_t keyPos = json.find(searchKey);
    if (keyPos == std::string::npos) return "";

    size_t colonPos = json.find(':', keyPos);
    if (colonPos == std::string::npos) return "";

    size_t braceStart = json.find('{', colonPos);
    if (braceStart == std::string::npos) return "";

    int braceCount = 1;
    size_t braceEnd = braceStart + 1;
    while (braceEnd < json.length() && braceCount > 0) {
        if (json[braceEnd] == '{') braceCount++;
        else if (json[braceEnd] == '}') braceCount--;
        braceEnd++;
    }

    return json.substr(braceStart, braceEnd - braceStart);
}

// Parse headers from JSON object string
std::vector<std::pair<std::string, std::string>> parseHeaders(const std::string& headersJson) {
    std::vector<std::pair<std::string, std::string>> headers;

    size_t pos = 0;
    while (pos < headersJson.length()) {
        size_t keyStart = headersJson.find('"', pos);
        if (keyStart == std::string::npos) break;
        keyStart++;

        size_t keyEnd = headersJson.find('"', keyStart);
        if (keyEnd == std::string::npos) break;

        std::string key = headersJson.substr(keyStart, keyEnd - keyStart);

        size_t colonPos = headersJson.find(':', keyEnd);
        if (colonPos == std::string::npos) break;

        size_t valueStart = headersJson.find('"', colonPos);
        if (valueStart == std::string::npos) break;
        valueStart++;

        size_t valueEnd = valueStart;
        while (valueEnd < headersJson.length()) {
            if (headersJson[valueEnd] == '"' && headersJson[valueEnd - 1] != '\\') break;
            valueEnd++;
        }

        std::string value = headersJson.substr(valueStart, valueEnd - valueStart);

        headers.push_back({key, value});
        pos = valueEnd + 1;
    }

    return headers;
}

// Check if response indicates success (has orderID)
bool isSuccess(const std::string& response, std::string& orderId) {
    // Look for "orderID" in response
    size_t orderIdPos = response.find("\"orderID\"");
    if (orderIdPos == std::string::npos) {
        orderIdPos = response.find("\"orderId\"");
    }
    if (orderIdPos != std::string::npos) {
        orderId = extractJsonString(response, "orderID");
        if (orderId.empty()) {
            orderId = extractJsonString(response, "orderId");
        }
        return !orderId.empty();
    }
    return false;
}

// Extract error message from response
std::string extractError(const std::string& response) {
    std::string error = extractJsonString(response, "error");
    if (error.empty()) {
        error = extractJsonString(response, "errorMsg");
    }
    if (error.empty()) {
        error = extractJsonString(response, "message");
    }
    if (error.empty() && !response.empty()) {
        // Truncate response if too long
        error = response.substr(0, std::min(response.length(), (size_t)100));
    }
    return error;
}

int main() {
    // Read JSON config from stdin
    std::stringstream buffer;
    buffer << std::cin.rdbuf();
    std::string inputJson = buffer.str();

    if (inputJson.empty()) {
        std::cerr << "ERROR: No input JSON provided via stdin" << std::endl;
        return 1;
    }

    // Parse config
    std::string url = extractJsonString(inputJson, "url");
    std::string body = extractJsonString(inputJson, "body");
    std::string headersJson = extractJsonObject(inputJson, "headers");
    int maxAttempts = extractJsonInt(inputJson, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
    int intervalMs = extractJsonInt(inputJson, "intervalMs", DEFAULT_INTERVAL_MS);

    // Unescape body (it's double-escaped in JSON)
    std::string unescapedBody;
    for (size_t i = 0; i < body.length(); i++) {
        if (body[i] == '\\' && i + 1 < body.length()) {
            char next = body[i + 1];
            if (next == '"') { unescapedBody += '"'; i++; }
            else if (next == '\\') { unescapedBody += '\\'; i++; }
            else if (next == 'n') { unescapedBody += '\n'; i++; }
            else if (next == 'r') { unescapedBody += '\r'; i++; }
            else if (next == 't') { unescapedBody += '\t'; i++; }
            else unescapedBody += body[i];
        } else {
            unescapedBody += body[i];
        }
    }
    body = unescapedBody;

    auto headers = parseHeaders(headersJson);

    if (url.empty() || body.empty()) {
        std::cerr << "ERROR: Missing url or body in config" << std::endl;
        return 1;
    }

    std::cerr << "CONFIG: url=" << url << ", maxAttempts=" << maxAttempts
              << ", intervalMs=" << intervalMs << ", headers=" << headers.size() << std::endl;

    // Initialize curl
    curl_global_init(CURL_GLOBAL_ALL);
    CURL* curl = curl_easy_init();

    if (!curl) {
        std::cerr << "ERROR: Failed to initialize curl" << std::endl;
        return 1;
    }

    // Set URL
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());

    // Enable POST
    curl_easy_setopt(curl, CURLOPT_POST, 1L);

    // Set body
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, body.length());

    // Set headers
    struct curl_slist* headerList = nullptr;
    headerList = curl_slist_append(headerList, "Content-Type: application/json");
    for (const auto& h : headers) {
        std::string header = h.first + ": " + h.second;
        headerList = curl_slist_append(headerList, header.c_str());
    }
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headerList);

    // Performance optimizations
    curl_easy_setopt(curl, CURLOPT_TCP_NODELAY, 1L);
    curl_easy_setopt(curl, CURLOPT_TCP_KEEPALIVE, 1L);
    curl_easy_setopt(curl, CURLOPT_FORBID_REUSE, 0L);  // Enable connection reuse

    // SSL settings
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);

    // Timeout (30 seconds)
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);

    // TLS warm-up
    std::cerr << "TLS warm-up..." << std::endl;
    ResponseBuffer warmupBuf;
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &warmupBuf);

    auto warmupStart = std::chrono::high_resolution_clock::now();

    // First request warms up TLS
    CURLcode warmupRes = curl_easy_perform(curl);

    auto warmupEnd = std::chrono::high_resolution_clock::now();
    auto warmupMs = std::chrono::duration_cast<std::chrono::milliseconds>(warmupEnd - warmupStart).count();

    std::cout << "WARMUP:" << warmupMs << std::endl;
    std::cerr << "Warmup: " << warmupMs << "ms, response: " << warmupBuf.data.substr(0, 100) << std::endl;

    // Check if warmup was already successful
    std::string orderId;
    if (warmupRes == CURLE_OK && isSuccess(warmupBuf.data, orderId)) {
        std::cout << "ATTEMPT:0:" << warmupMs << ":true:" << orderId << std::endl;
        std::cout << "SUCCESS:" << orderId << std::endl;
        std::cout << "STATS:min=" << warmupMs << ",max=" << warmupMs << ",avg=" << warmupMs
                  << ",median=" << warmupMs << ",total=1" << std::endl;

        curl_slist_free_all(headerList);
        curl_easy_cleanup(curl);
        curl_global_cleanup();
        return 0;
    }

    // Spam loop
    std::vector<long> latencies;
    bool success = false;
    int attempts = 0;

    std::cerr << "Starting spam loop..." << std::endl;

    while (!success && attempts < maxAttempts) {
        attempts++;

        ResponseBuffer responseBuf;
        curl_easy_setopt(curl, CURLOPT_WRITEDATA, &responseBuf);

        auto start = std::chrono::high_resolution_clock::now();
        CURLcode res = curl_easy_perform(curl);
        auto end = std::chrono::high_resolution_clock::now();

        auto latencyMs = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        latencies.push_back(latencyMs);

        if (res == CURLE_OK) {
            if (isSuccess(responseBuf.data, orderId)) {
                success = true;
                std::cout << "ATTEMPT:" << attempts << ":" << latencyMs << ":true:" << orderId << std::endl;
                std::cerr << "#" << attempts << ": " << latencyMs << "ms - SUCCESS! Order: " << orderId << std::endl;
            } else {
                std::string error = extractError(responseBuf.data);
                std::cout << "ATTEMPT:" << attempts << ":" << latencyMs << ":false:" << error << std::endl;

                if (attempts % 50 == 0) {
                    std::cerr << "#" << attempts << ": " << latencyMs << "ms - " << error << std::endl;
                }
            }
        } else {
            std::string curlError = curl_easy_strerror(res);
            std::cout << "ATTEMPT:" << attempts << ":" << latencyMs << ":false:curl_" << curlError << std::endl;

            if (attempts % 50 == 0) {
                std::cerr << "#" << attempts << ": " << latencyMs << "ms - curl error: " << curlError << std::endl;
            }
        }

        // Interval between requests
        if (!success && intervalMs > 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(intervalMs));
        }
    }

    // Output result
    if (success) {
        std::cout << "SUCCESS:" << orderId << std::endl;
    } else {
        std::cout << "FAILED:max_attempts_reached" << std::endl;
    }

    // Calculate stats
    if (!latencies.empty()) {
        std::vector<long> sorted = latencies;
        std::sort(sorted.begin(), sorted.end());

        long sum = 0;
        for (long l : latencies) sum += l;

        long minL = sorted.front();
        long maxL = sorted.back();
        long avg = sum / latencies.size();
        long median = sorted[sorted.size() / 2];

        std::cout << "STATS:min=" << minL << ",max=" << maxL << ",avg=" << avg
                  << ",median=" << median << ",total=" << latencies.size() << std::endl;

        std::cerr << "Stats: min=" << minL << "ms, max=" << maxL << "ms, avg=" << avg
                  << "ms, median=" << median << "ms, total=" << latencies.size() << std::endl;
    }

    // Cleanup
    curl_slist_free_all(headerList);
    curl_easy_cleanup(curl);
    curl_global_cleanup();

    return success ? 0 : 1;
}
