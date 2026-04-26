#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Adafruit_PN532.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// =====================
// PIN SETTINGS
// =====================
#define NFC_SDA 21
#define NFC_SCL 22

#define OLED_SDA 16
#define OLED_SCL 17

// =====================
// OLED SETTINGS
// =====================
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_ADDR 0x3C

TwoWire OLEDWire = TwoWire(1);

Adafruit_PN532 nfc(NFC_SDA, NFC_SCL);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &OLEDWire, OLED_RESET);

// =====================
// WIFI SETTINGS
// =====================
const char* WIFI_SSID = "vahabA";
const char* WIFI_PASS = "Itay1811";

// שנה את ה-IP לכתובת של המחשב שעליו רצה המערכת
const char* SERVER_URL = "http://192.168.68.105:4000/api/nfc/attendance";

// =====================
// COOLDOWN
// =====================
unsigned long lastReadTime = 0;
const unsigned long cooldownTime = 10000; // 10 seconds

// =====================
// DISPLAY HELPER
// =====================
void showText(String line1, String line2 = "", String line3 = "", String line4 = "") {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.println(line1);

  display.setCursor(0, 16);
  display.println(line2);

  display.setCursor(0, 32);
  display.println(line3);

  display.setCursor(0, 48);
  display.println(line4);

  display.display();
}

// =====================
// WIFI
// =====================
void connectWiFi() {
  showText("Connecting WiFi", WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int tries = 0;

  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WIFI_OK");
    Serial.print("IP:");
    Serial.println(WiFi.localIP());

    showText("WiFi Connected", WiFi.localIP().toString(), "System Ready");
    delay(1500);
  } else {
    Serial.println("WIFI_FAILED");
    showText("WiFi Failed", "Check SSID/PASS");
    delay(2000);
  }
}

// =====================
// SEND CARD
// =====================
void sendCardToServer(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WIFI_RECONNECT");
    showText("WiFi Lost", "Reconnecting...");
    connectWiFi();

    if (WiFi.status() != WL_CONNECTED) {
      showText("No WiFi", "Cannot Send", uid);
      return;
    }
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"uid\":\"" + uid + "\"}";

  Serial.print("POST:");
  Serial.println(body);

  int httpCode = http.POST(body);

  if (httpCode > 0) {
    String response = http.getString();

    Serial.print("HTTP_CODE:");
    Serial.println(httpCode);

    Serial.print("SERVER_RESPONSE:");
    Serial.println(response);

    if (httpCode == 200) {
      if (response.indexOf("entry") >= 0 || response.indexOf("in") >= 0 || response.indexOf("כניסה") >= 0) {
        showText("ACCESS OK", "ENTRY", uid, "Wait 10 sec");
      } else if (response.indexOf("exit") >= 0 || response.indexOf("out") >= 0 || response.indexOf("יציאה") >= 0) {
        showText("ACCESS OK", "EXIT", uid, "Wait 10 sec");
      } else {
        showText("ACCESS OK", uid, "Saved", "Wait 10 sec");
      }
    } else if (httpCode == 404) {
      showText("Unknown Card", uid, "Not assigned");
    } else {
      showText("Server Error", "HTTP: " + String(httpCode), uid);
    }
  } else {
    Serial.print("HTTP_ERROR:");
    Serial.println(httpCode);
    showText("Connection Error", String(httpCode), uid);
  }

  http.end();
}

// =====================
// SETUP
// =====================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(NFC_SDA, NFC_SCL);
  OLEDWire.begin(OLED_SDA, OLED_SCL);

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("OLED_NOT_FOUND");
  } else {
    showText("VCLOCK_TIME", "Starting...");
  }

  connectWiFi();

  nfc.begin();

  uint32_t versiondata = nfc.getFirmwareVersion();

  if (!versiondata) {
    Serial.println("PN532_NOT_FOUND");
    showText("PN532 ERROR", "Reader Not Found");
    while (1) {
      delay(1000);
    }
  }

  Serial.print("PN532_OK:");
  Serial.println(versiondata, HEX);

  nfc.SAMConfig();

  showText("VCLOCK_TIME", "NFC Ready", "Scan Card");
  Serial.println("NFC_READY");
}

// =====================
// LOOP
// =====================
void loop() {
  if (millis() - lastReadTime < cooldownTime) {
    return;
  }

  uint8_t uid[7];
  uint8_t uidLength;

  bool success = nfc.readPassiveTargetID(
    PN532_MIFARE_ISO14443A,
    uid,
    &uidLength,
    1000
  );

  if (success) {
    String cardUID = "";

    for (uint8_t i = 0; i < uidLength; i++) {
      if (uid[i] < 0x10) {
        cardUID += "0";
      }

      cardUID += String(uid[i], HEX);
    }

    cardUID.toUpperCase();

    Serial.print("CARD:");
    Serial.println(cardUID);

    showText("Card Read", cardUID, "Sending...");

    sendCardToServer(cardUID);

    lastReadTime = millis();
  }
}