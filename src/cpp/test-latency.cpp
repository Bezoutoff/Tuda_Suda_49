/**
 * C++ Latency Test for Polymarket
 *
 * Reads config from stdin, generates HMAC signatures, spams POST requests.
 * Outputs latency stats to stdout.
 *
 * Build: g++ -O3 -o dist/test-latency-cpp src/cpp/test-latency.cpp -lcurl -lssl -lcrypto
 * Usage: echo '{"body":"...","apiKey":"...","secret":"...","passphrase":"...","address":"..."}' | ./test-latency-cpp
 */

#include <curl/curl.h>
#include <openssl/hmac.h>
#include <openssl/bio.h>
#include <openssl/evp.h>
#include <openssl/buffer.h>
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
const char* CLOB_URL = "https://clob.polymarket.com";
const char* ORDER_PATH = "/orders";  // Use /orders for array body [{...}]

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

// Base64 decode - supports both standard and URL-safe base64
std::string base64Decode(const std::string& input) {
    static const std::string base64_chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    auto indexOf = [&](char c) -> int {
        if (c == '=') return -1;
        // Handle URL-safe base64: convert - to + and _ to /
        if (c == '-') c = '+';
        if (c == '_') c = '/';
        size_t pos = base64_chars.find(c);
        return (pos != std::string::npos) ? (int)pos : -2;
    };

    std::string output;
    output.reserve((input.length() * 3) / 4);

    int val = 0;
    int bits = 0;

    for (char c : input) {
        if (c == '=' || c == '\n' || c == '\r' || c == ' ') continue;

        int idx = indexOf(c);
        if (idx < 0) continue;  // Skip invalid chars

        val = (val << 6) | idx;
        bits += 6;

        if (bits >= 8) {
            bits -= 8;
            output.push_back(static_cast<char>((val >> bits) & 0xFF));
        }
    }

    return output;
}

// Base64 encode
std::string base64Encode(const unsigned char* input, int length) {
    BIO* bio = BIO_new(BIO_s_mem());
    BIO* b64 = BIO_new(BIO_f_base64());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    bio = BIO_push(b64, bio);

    BIO_write(bio, input, length);
    BIO_flush(bio);

    BUF_MEM* bufferPtr;
    BIO_get_mem_ptr(bio, &bufferPtr);

    std::string output(bufferPtr->data, bufferPtr->length);
    BIO_free_all(bio);
    return output;
}

// Generate HMAC-SHA256 signature
std::string generateSignature(const std::string& secret, const std::string& message, bool debug = false) {
    // Decode base64 secret
    std::string decodedSecret = base64Decode(secret);

    if (debug) {
        std::cerr << "DEBUG HMAC:" << std::endl;
        std::cerr << "  secret (first 8): " << secret.substr(0, 8) << "..." << std::endl;
        std::cerr << "  secret length: " << secret.length() << std::endl;
        std::cerr << "  decoded secret length: " << decodedSecret.length() << std::endl;
        std::cerr << "  message: " << message.substr(0, 50) << "..." << std::endl;
        std::cerr << "  message length: " << message.length() << std::endl;
    }

    // Generate HMAC
    unsigned char hash[EVP_MAX_MD_SIZE];
    unsigned int hashLen;

    HMAC(EVP_sha256(),
         decodedSecret.data(), decodedSecret.length(),
         reinterpret_cast<const unsigned char*>(message.data()), message.length(),
         hash, &hashLen);

    // Encode to base64
    std::string signature = base64Encode(hash, hashLen);

    // Convert to URL-safe base64 (required by Polymarket)
    // '+' -> '-', '/' -> '_'
    for (char& c : signature) {
        if (c == '+') c = '-';
        else if (c == '/') c = '_';
    }

    if (debug) {
        std::cerr << "  signature: " << signature << std::endl;
    }

    return signature;
}

// Simple JSON value extractor
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
        if (json[valueEnd] == '"' && (valueEnd == 0 || json[valueEnd - 1] != '\\')) break;
        valueEnd++;
    }

    // Unescape the value
    std::string value = json.substr(valueStart, valueEnd - valueStart);
    std::string unescaped;
    for (size_t i = 0; i < value.length(); i++) {
        if (value[i] == '\\' && i + 1 < value.length()) {
            char next = value[i + 1];
            if (next == '"') { unescaped += '"'; i++; }
            else if (next == '\\') { unescaped += '\\'; i++; }
            else if (next == 'n') { unescaped += '\n'; i++; }
            else if (next == 'r') { unescaped += '\r'; i++; }
            else if (next == 't') { unescaped += '\t'; i++; }
            else unescaped += value[i];
        } else {
            unescaped += value[i];
        }
    }
    return unescaped;
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

// Check if response indicates success (has orderID)
bool isSuccess(const std::string& response, std::string& orderId) {
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
        error = response.substr(0, std::min(response.length(), (size_t)100));
    }
    return error;
}

// Fetch server time from CLOB API
std::string fetchServerTime(CURL* curl) {
    std::string timeUrl = std::string(CLOB_URL) + "/time";
    curl_easy_setopt(curl, CURLOPT_URL, timeUrl.c_str());
    curl_easy_setopt(curl, CURLOPT_HTTPGET, 1L);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, nullptr);

    ResponseBuffer buf;
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &buf);

    CURLcode res = curl_easy_perform(curl);
    if (res != CURLE_OK) {
        std::cerr << "Failed to fetch server time: " << curl_easy_strerror(res) << std::endl;
        return "";
    }

    // Remove quotes if present
    std::string time = buf.data;
    if (!time.empty() && time[0] == '"') {
        time = time.substr(1, time.length() - 2);
    }
    return time;
}

// Perform POST request with authentication
CURLcode postOrder(CURL* curl, const std::string& body,
                   const std::string& apiKey, const std::string& secret,
                   const std::string& passphrase, const std::string& address,
                   const std::string& timestamp, ResponseBuffer& response,
                   bool debug = false) {

    std::string orderUrl = std::string(CLOB_URL) + ORDER_PATH;

    // Generate signature: timestamp + method + path + body
    std::string message = timestamp + "POST" + ORDER_PATH + body;
    std::string signature = generateSignature(secret, message, debug);

    if (debug) {
        std::cerr << "DEBUG HEADERS:" << std::endl;
        std::cerr << "  POLY_ADDRESS: " << address << std::endl;
        std::cerr << "  POLY_TIMESTAMP: " << timestamp << std::endl;
        std::cerr << "  POLY_API_KEY: " << apiKey << std::endl;
        std::cerr << "  POLY_PASSPHRASE: " << passphrase << std::endl;
        std::cerr << "  POLY_SIGNATURE: " << signature << std::endl;
    }

    // Set URL
    curl_easy_setopt(curl, CURLOPT_URL, orderUrl.c_str());

    // Set POST
    curl_easy_setopt(curl, CURLOPT_POST, 1L);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, body.length());

    // Build headers
    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    headers = curl_slist_append(headers, ("POLY_ADDRESS: " + address).c_str());
    headers = curl_slist_append(headers, ("POLY_SIGNATURE: " + signature).c_str());
    headers = curl_slist_append(headers, ("POLY_TIMESTAMP: " + timestamp).c_str());
    headers = curl_slist_append(headers, ("POLY_API_KEY: " + apiKey).c_str());
    headers = curl_slist_append(headers, ("POLY_PASSPHRASE: " + passphrase).c_str());

    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);

    CURLcode res = curl_easy_perform(curl);

    curl_slist_free_all(headers);
    return res;
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
    std::string body = extractJsonString(inputJson, "body");
    std::string apiKey = extractJsonString(inputJson, "apiKey");
    std::string secret = extractJsonString(inputJson, "secret");
    std::string passphrase = extractJsonString(inputJson, "passphrase");
    std::string address = extractJsonString(inputJson, "address");
    int maxAttempts = extractJsonInt(inputJson, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
    int intervalMs = extractJsonInt(inputJson, "intervalMs", DEFAULT_INTERVAL_MS);

    // Extract test values for signature comparison
    std::string testTimestamp = extractJsonString(inputJson, "testTimestamp");
    std::string testSignature = extractJsonString(inputJson, "testSignature");

    // Debug: print raw extracted values
    std::cerr << "DEBUG JSON PARSING:" << std::endl;
    std::cerr << "  secret raw: [" << secret << "]" << std::endl;
    std::cerr << "  secret length: " << secret.length() << std::endl;
    std::cerr << "  body (first 50): " << body.substr(0, 50) << "..." << std::endl;
    std::cerr << "  body length: " << body.length() << std::endl;

    // Compare signatures with same timestamp
    if (!testTimestamp.empty()) {
        std::string testMessage = testTimestamp + "POST" + ORDER_PATH + body;
        std::string cppSignature = generateSignature(secret, testMessage, false);
        std::cerr << "SIGNATURE COMPARISON (same timestamp):" << std::endl;
        std::cerr << "  Timestamp: " << testTimestamp << std::endl;
        std::cerr << "  Node.js signature: " << testSignature << std::endl;
        std::cerr << "  C++ signature:     " << cppSignature << std::endl;
        std::cerr << "  Match: " << (testSignature == cppSignature ? "YES" : "NO") << std::endl;
    }

    if (body.empty() || apiKey.empty() || secret.empty() || passphrase.empty() || address.empty()) {
        std::cerr << "ERROR: Missing required config fields" << std::endl;
        std::cerr << "  body: " << (body.empty() ? "MISSING" : "OK") << std::endl;
        std::cerr << "  apiKey: " << (apiKey.empty() ? "MISSING" : "OK (" + apiKey.substr(0, 8) + "...)") << std::endl;
        std::cerr << "  secret: " << (secret.empty() ? "MISSING" : "OK") << std::endl;
        std::cerr << "  passphrase: " << (passphrase.empty() ? "MISSING" : "OK") << std::endl;
        std::cerr << "  address: " << (address.empty() ? "MISSING" : "OK (" + address.substr(0, 10) + "...)") << std::endl;
        return 1;
    }

    std::cerr << "CONFIG: maxAttempts=" << maxAttempts << ", intervalMs=" << intervalMs << std::endl;
    std::cerr << "  apiKey: " << apiKey.substr(0, 8) << "..." << std::endl;
    std::cerr << "  address: " << address.substr(0, 10) << "..." << std::endl;

    // Initialize curl
    curl_global_init(CURL_GLOBAL_ALL);
    CURL* curl = curl_easy_init();

    if (!curl) {
        std::cerr << "ERROR: Failed to initialize curl" << std::endl;
        return 1;
    }

    // Performance optimizations
    curl_easy_setopt(curl, CURLOPT_TCP_NODELAY, 1L);
    curl_easy_setopt(curl, CURLOPT_TCP_KEEPALIVE, 1L);
    curl_easy_setopt(curl, CURLOPT_FORBID_REUSE, 0L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 1L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 2L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeCallback);

    // Fetch server time for TLS warmup
    std::cerr << "Fetching server time (TLS warmup)..." << std::endl;
    auto warmupStart = std::chrono::high_resolution_clock::now();
    std::string serverTime = fetchServerTime(curl);
    auto warmupEnd = std::chrono::high_resolution_clock::now();
    auto warmupMs = std::chrono::duration_cast<std::chrono::milliseconds>(warmupEnd - warmupStart).count();

    if (serverTime.empty()) {
        std::cerr << "ERROR: Failed to get server time" << std::endl;
        curl_easy_cleanup(curl);
        curl_global_cleanup();
        return 1;
    }

    std::cout << "WARMUP:" << warmupMs << std::endl;
    std::cout.flush();
    std::cerr << "Server time: " << serverTime << " (warmup: " << warmupMs << "ms)" << std::endl;

    // Spam loop
    std::vector<long> latencies;
    bool success = false;
    int attempts = 0;
    std::string orderId;

    std::cerr << "Starting spam loop..." << std::endl;

    while (!success && attempts < maxAttempts) {
        attempts++;

        // Fetch fresh server time every 100 requests to avoid timestamp drift
        if (attempts % 100 == 1) {
            std::string newTime = fetchServerTime(curl);
            if (!newTime.empty()) {
                serverTime = newTime;
            }
        }

        ResponseBuffer responseBuf;
        bool debugFirst = (attempts == 1);  // Debug first request
        auto start = std::chrono::high_resolution_clock::now();
        CURLcode res = postOrder(curl, body, apiKey, secret, passphrase, address, serverTime, responseBuf, debugFirst);
        auto end = std::chrono::high_resolution_clock::now();

        auto latencyMs = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
        latencies.push_back(latencyMs);

        if (res == CURLE_OK) {
            if (isSuccess(responseBuf.data, orderId)) {
                success = true;
                std::cout << "ATTEMPT:" << attempts << ":" << latencyMs << ":true:" << orderId << std::endl;
                std::cout.flush();
                std::cerr << "#" << attempts << ": " << latencyMs << "ms - SUCCESS! Order: " << orderId << std::endl;
            } else {
                std::string error = extractError(responseBuf.data);
                std::cout << "ATTEMPT:" << attempts << ":" << latencyMs << ":false:" << error << std::endl;
                std::cout.flush();

                if (attempts % 50 == 0 || attempts <= 3) {
                    std::cerr << "#" << attempts << ": " << latencyMs << "ms - " << error << std::endl;
                }
            }
        } else {
            std::string curlError = curl_easy_strerror(res);
            std::cout << "ATTEMPT:" << attempts << ":" << latencyMs << ":false:curl_" << curlError << std::endl;
            std::cout.flush();

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
    std::cout.flush();

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
        std::cout.flush();

        std::cerr << "Stats: min=" << minL << "ms, max=" << maxL << "ms, avg=" << avg
                  << "ms, median=" << median << "ms, total=" << latencies.size() << std::endl;
    }

    // Cleanup
    curl_easy_cleanup(curl);
    curl_global_cleanup();

    return success ? 0 : 1;
}
