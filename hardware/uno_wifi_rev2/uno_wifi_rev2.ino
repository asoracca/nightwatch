// UNO WiFi Rev2: real PIR input -> authenticated HTTPS event. No CV on the MCU.
#include <WiFiNINA.h>
#include <ArduinoHttpClient.h>
#include <TimeLib.h>
#include "arduino_secrets.h"

const uint8_t PIR_PIN = 2;
const uint8_t QUEUE_SIZE = 3;
char queuePayload[QUEUE_SIZE][240];
uint8_t queueHead = 0, queueCount = 0;
unsigned long retryAt = 0, retryDelay = 1000, lastWifiAttempt = 0;
unsigned long syncedEpoch = 0, syncedMillis = 0;
bool lastMotion = false, authBlocked = false;
WiFiSSLClient tls;
HttpClient http(tls, API_HOST, 443);

void enqueueMotion() {
  if (!syncedEpoch) { Serial.println(F("No synchronized clock; event not recorded")); return; }
  if (queueCount == QUEUE_SIZE) { Serial.println(F("Sensor queue full; newest event dropped")); return; }
  time_t eventTime = syncedEpoch + ((unsigned long)(millis() - syncedMillis) / 1000);
  char timestamp[25];
  snprintf(timestamp, sizeof(timestamp), "%04d-%02d-%02dT%02d:%02d:%02dZ", year(eventTime), month(eventTime), day(eventTime), hour(eventTime), minute(eventTime), second(eventTime));
  uint8_t tail = (queueHead + queueCount) % QUEUE_SIZE;
  snprintf(queuePayload[tail], sizeof(queuePayload[tail]), "{\"device_id\":\"%s\",\"event_type\":\"motion_detected\",\"event_time\":\"%s\",\"sensor_data\":{\"motion\":true}}", DEVICE_ID, timestamp);
  queueCount++;
}
void dropHead() { queueHead = (queueHead + 1) % QUEUE_SIZE; queueCount--; retryDelay = 1000; }
void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  http.setHttpResponseTimeout(15000);
  if (WiFi.status() == WL_NO_MODULE) { Serial.println(F("WiFi module missing")); while (true) delay(1000); }
  Serial.println(F("NightWatch sensor prototype starting; no credentials printed"));
}
void loop() {
  const unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) {
    if ((unsigned long)(now-lastWifiAttempt) > 10000 || lastWifiAttempt == 0) {
      lastWifiAttempt = now;
      Serial.println(F("Connecting WiFi")); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  } else if (!syncedEpoch || (unsigned long)(now-syncedMillis) > 3600000UL) {
    const unsigned long epoch = WiFi.getTime();
    if (epoch > 1700000000UL) { syncedEpoch=epoch; syncedMillis=millis(); }
  }
  const bool motion = digitalRead(PIR_PIN) == HIGH;
  if (motion && !lastMotion) enqueueMotion();
  lastMotion=motion;
  if (!queueCount || authBlocked || WiFi.status()!=WL_CONNECTED || (long)(now-retryAt)<0) return;
  // Root certificates for API_HOST must be provisioned with the official NINA tool.
  // WiFiSSLClient verifies TLS; do not replace it with an insecure connection.
  http.beginRequest(); http.post("/api/device-events");
  http.sendHeader("Content-Type", "application/json");
  http.sendHeader("Content-Length", strlen(queuePayload[queueHead]));
  http.sendHeader("Authorization", "Bearer " DEVICE_TOKEN);
  http.beginBody(); http.print(queuePayload[queueHead]); http.endRequest();
  const int status = http.responseStatusCode();
  http.stop();
  if (status>=200 && status<300) { Serial.println(F("Event acknowledged")); dropHead(); }
  else if (status==401 || status==403) { Serial.println(F("Device authentication failed; provision a new token")); authBlocked=true; }
  else if (status>=400 && status<500 && status!=408 && status!=429) { Serial.print(F("Rejected event, HTTP ")); Serial.println(status); dropHead(); }
  else { Serial.print(F("Connection/server retry, status ")); Serial.println(status); retryDelay=min(retryDelay*2,60000UL); }
  // Retries preserve the exact timestamp and readings; server deduplicates them.
  retryAt=millis()+retryDelay+(millis()%251);
}
