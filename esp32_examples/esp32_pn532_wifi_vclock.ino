#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_PN532.h>

#define NFC_SDA 21
#define NFC_SCL 22

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL = "http://192.168.1.100:3000/api/nfc/attendance";

Adafruit_PN532 nfc(NFC_SDA, NFC_SCL);
unsigned long lastReadTime = 0;
const unsigned long cooldownTime = 10000;

void setup() {
  Serial.begin(115200);
  delay(1000);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WIFI_OK IP=");
  Serial.println(WiFi.localIP());

  Wire.begin(NFC_SDA, NFC_SCL);
  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("PN532_NOT_FOUND");
    while (1) delay(1000);
  }
  nfc.SAMConfig();
  Serial.println("NFC_READY");
}

void sendUid(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WIFI_NOT_CONNECTED");
    return;
  }
  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  String body = "{\"uid\":\"" + uid + "\"}";
  int code = http.POST(body);
  Serial.print("HTTP_CODE:");
  Serial.println(code);
  if (code > 0) Serial.println(http.getString());
  http.end();
}

void loop() {
  if (millis() - lastReadTime < cooldownTime) return;

  uint8_t uid[7];
  uint8_t uidLength;
  bool success = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 1000);
  if (!success) return;

  String cardUID = "";
  for (uint8_t i = 0; i < uidLength; i++) {
    if (uid[i] < 0x10) cardUID += "0";
    cardUID += String(uid[i], HEX);
  }
  cardUID.toUpperCase();
  Serial.print("CARD:");
  Serial.println(cardUID);
  sendUid(cardUID);
  lastReadTime = millis();
}
