<div align="center">

# 🌿 VoltHome — Akıllı & Sürdürülebilir Enerji Yönetim Platformu
### *Gerçek Zamanlı IoT Telemetrisi, EPDK Çok Zamanlı Tarife Motoru, 3D Ev Simülasyonu ve Gemini AI Tasarruf Danışmanı*

[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.3.2-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![Apache Kafka](https://img.shields.io/badge/Apache%20Kafka-Distributed%20Streaming-231F20?style=for-the-badge&logo=apachekafka&logoColor=white)](https://kafka.apache.org/)
[![Apache Ignite](https://img.shields.io/badge/Apache%20Ignite-In--Memory%20Grid-E84325?style=for-the-badge&logo=apacheignite&logoColor=white)](https://ignite.apache.org/)
[![Three.js](https://img.shields.io/badge/Three.js-3D%20WebGL%20Simulation-049EF4?style=for-the-badge&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15.0-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose%20Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

</div>

---

## 📌 Projeye Genel Bakış

**VoltHome**, ev ve ticari binalardaki elektrik tüketimini milisaniyeler düzeyinde izleyen, EPDK çok zamanlı tarifeleri üzerinden faturalandırma ve ay sonu harcama projeksiyonu yapan, aşırı yük durumlarında otonom sigorta kurallarını işleten ve Google Gemini yapay zekası ile kişiselleştirilmiş tasarruf reçeteleri üreten **olay güdümlü (event-driven) bir IoT enerji ekosistemidir.**

Platform; modern doğa dostu (Eco-Smart) minimalist arayüzü, interaktif 3D WebGL mimari ev simülasyonu ve yüksek performanslı in-memory mikroservis mimarisiyle uçtan uca çalışır.

---

## 🏗️ Sistem Mimarisi & Veri Akışı

```mermaid
flowchart TD
    subgraph IoT_Katmani [IoT Sensör Katmanı]
        PySim["🐍 Python Telemetri Simülatörü<br/>(VoltHomeTelemetrySensors.py)"]
    end

    subgraph Mesajlasma_Katmani [Apache Kafka Mesaj Kuyruğu]
        K_Reg["Topic: volthome-registration"]
        K_Tel["Topic: volthome-telemetry"]
        K_Cmd["Topic: volthome-commands"]
    end

    subgraph Bellek_Katmani [Apache Ignite In-Memory Data Grid]
        IgniteGrid["⚡ Ignite Cache (Port 10800)<br/>- HomeLiveState<br/>- Anomali Sayaçları<br/>- Günlük Kümülatif Enerji/Tutar"]
    end

    subgraph Backend_Katmani [VoltHome Core - Spring Boot 3.x]
        Auth["🔐 JWT Güvenlik & Kullanıcı Yönetimi"]
        TelService["📊 TelemetryConsumerService"]
        RuleEngine["🛡️ AutomationEngine (Kural & Sigorta Motoru)"]
        TariffEngine["⏱️ EPDK Dinamik Tarife & Fatura Servisi"]
        AiService["🧠 Gemini AI Danışmanı & Tahminleme"]
        WsHandler["🔄 WebSocket Telemetri Yayını (/ws/telemetry)"]
    end

    subgraph Veritabani [Kalıcı Veritabanı]
        PG[(🐘 PostgreSQL 15)]
    end

    subgraph Frontend_Katmani [VoltHome Web Uygulaması]
        Landing["🏡 Dinamik Karşılama Sayfası (Landing)"]
        Dashboard["📊 Enerji & Cihaz Yönetim Paneli"]
        Sim3D["🎮 3D WebGL Ev Simülatörü (FPS & İzometrik)"]
        InvoiceModal["📄 Yazdırılabilir Resmi EPDK Faturası"]
    end

    %% Akış Bağlantıları
    PySim -->|Anlık Watt Telemetrisi (2s)| K_Tel
    K_Reg -->|Yeni Ev/Cihaz Bilgisi| PySim
    K_Cmd -->|Uzaktan Kapatma/Açma (SHUTDOWN/ON)| PySim

    K_Tel --> TelService
    TelService <-->|Milisaniyelik Oku/Yaz| IgniteGrid
    TelService --> RuleEngine
    RuleEngine -->|Anomali veya Kota Aşımında| K_Cmd
    TelService --> WsHandler
    TelService -->|Periyodik Snapshot| PG

    Backend_Katmani --> PG
    WsHandler -->|Canlı Veri Yayını| Dashboard
    WsHandler -->|Cihaz Durumları| Sim3D
    Sim3D -->|3D Sahneden Cihaz Aç/Kapa| K_Cmd
    Dashboard --> Auth
```

---

## ✨ Temel Özellikler

### 1. 🌿 Doğa Dostu (Eco-Smart) Minimalist Kullanıcı Arayüzü
- Ağır siyah temalar ve emoji kalabalığı yerine; ferah açık taş, adaçayı ve zümrüt yeşili tonlarında İskandinav/Eco-Tech tasarımı.
- Temiz, kurumsal ve tek tip **FontAwesome** vektörel ikonografi.
- Dinamik karşılama ana sayfası (Hero Landing Page) ve canlı metrik sayaçları.

### 2. 🎮 3D İnteraktif Ev Simülasyonu (Three.js WebGL)
- Gün ışığı alan mimari ev tasarımı, oda bazlı cihaz yerleşimleri ve bahçe çevresi.
- **İki Farklı Kamera Modu:**
  - **Kuş Bakışı (İzometrik):** Fare ile serbest döndürme, yakınlaşma ve pan.
  - **FPS Modu (Karakter Gözü):** [W, A, S, D] tuşları ve fare ile evin içinde gerçek zamanlı birinci şahıs gezinme.
- **Karakter ve Hava Durumu Seçimi:** Robot, Erkek, Kadın, Çocuk avatarları; Güneşli, Gece ve Yağmurlu atmosfer modları.
- **Canlı IoT Kontrolü:** 3D sahnedeki cihazlara tıklandığında Kafka üzerinden gerçek simülatördeki cihaz açılır/kapanır.

### 3. ⏱️ Canlı EPDK Çok Zamanlı Tarife & Resmi Fatura Modeli
- Gündüz (T1: 06:00 - 17:00 / 3.85 TL), Puant (T2: 17:00 - 22:00 / 6.20 TL) ve Gece (T3: 22:00 - 06:00 / 2.10 TL) tarife dilimleri.
- Dağıtım ve iletim bedeli, Enerji Fonu, TRT Payı ve %20 KDV kalemleriyle **yazdırılabilir resmi elektrik faturası (Print / PDF)** dökümü.

### 4. 🧠 Gemini AI Tasarruf Danışmanı & Ay Sonu Bütçe Projeksiyonu
- Geçmiş tüketim hızı ve kalan gün sayısına göre ay sonu toplam tüketim (kWh) ve fatura tutarı (TL) projeksiyonu.
- Google Gemini LLM API entegrasyonu ile evdeki cihaz dağılımına özel dinamik tasarruf reçetesi üretimi.

### 5. 🛡️ Otonom IoT Senaryoları & Koruma Sigortası
- **Hazır 4 Akıllı Senaryo:** *Gece Eko Modu*, *Pik Tarife Koruyucu*, *Aşırı Yük Sigortası* ve *%80 Bütçe Koruma Kilidi*.
- Kullanıcı tanımlı özel kural motoru (Safe limit aşımı veya Watt eşiği geçildiğinde otomatik `SHUTDOWN` komutu).

---

## 🔍 Dürüst Sistem Durumu (Gerçek vs. Simüle Edilenler)

| Katman / Özellik | Durum | Açıklama |
| :--- | :---: | :--- |
| **Spring Boot Backend & REST API** |  **Gerçek** | JWT doğrulama, JPA veri tabanı işlemleri, Kafka/Ignite entegrasyonu ve WebSocket yayını tam ve gerçektir. |
| **Apache Kafka & Ignite** |  **Gerçek** | Gerçek Docker konteynerleri üzerinde çalışır; telemetri, komut ve kayıt topic'leri aktiftir. |
| **PostgreSQL Veritabanı** |  **Gerçek** | Kullanıcılar, evler, cihazlar, kurallar, loglar ve AI önerileri kalıcı PostgreSQL tablolarında saklanır. |
| **IoT Donanım / Sayaçlar** | ⚡ **Simülatör** | Fiziksel bir akıllı priz yerine `VoltHomeTelemetrySensors.py` Python servisi çalışır; her 2 saniyede bir gerçekçi stokastik telemetri üretir ve Kafka `volthome-commands` topic'ini dinler. |
| **Google Gemini Yapay Zekası** | 🧠 **Hibrit** | `GEMINI_API_KEY` ortam değişkeni tanımlandığında Google Generative AI API'sini canlı çağırır; anahtar girilmediğinde akıllı yerel kural motoru devrededir. |
| **EPDK Faturalandırma** | 📐 **Formüle Dayalı** | Gerçek EPDK elektrik piyasası tarife formülleri ve vergi mevzuatına uygun matematiksel motor ile hesaplanır. |

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- **Docker & Docker Compose** (Önerilen en kolay yöntem)
- Veya yerel çalıştırma için: **Java 17+**, **Maven**, **Python 3.9+**

### Yöntem A: Docker Compose ile Tek Komutta Başlatma (Önerilen)

Tüm servisleri (Postgres, Zookeeper, Kafka, Ignite, Core Backend ve IoT Python Simülatörü) ayağa kaldırmak için projenin kök dizininde:

```bash
docker compose up -d --build
```

Konteynerlerin durumunu kontrol etmek için:
```bash
docker compose ps
```

---

### Yöntem B: Yerel Geliştirme Ortamında Manuel Çalıştırma

#### 1. Altyapı Konteynerlerini Başlatın
```bash
docker compose up -d postgres zookeeper kafka ignite
```

#### 2. Spring Boot Backend'i Derleyin ve Çalıştırın
```bash
cd core
mvn clean package -DskipTests
java --add-exports=java.base/jdk.internal.misc=ALL-UNNAMED \
     --add-exports=java.base/sun.nio.ch=ALL-UNNAMED \
     --add-opens=java.base/java.nio=ALL-UNNAMED \
     --add-opens=java.base/java.util=ALL-UNNAMED \
     --add-opens=java.base/java.lang=ALL-UNNAMED \
     -jar target/volthome-core-1.0.0.jar
```

#### 3. Python IoT Telemetri Simülatörünü Başlatın
```bash
cd telemetry-sensors
pip install kafka-python-ng
python VoltHomeTelemetrySensors.py
```

---

## 🔑 Hızlı Demo Giriş Bilgileri

Uygulama ilk açıldığında aşağıdaki hazır demo kullanıcısı ile tek tıkla giriş yapabilir veya yeni bir hesap oluşturabilirsiniz:

- **Kullanıcı Adı:** `testuser`
- **Şifre:** `Password123`
- *(Giriş modalında "Hızlı Demo Girişi" kutusuna tıklayarak bilgileri otomatik doldurabilirsiniz).*

---

## 🌐 Servis Portları ve Bağlantılar

| Servis | URL / Port | Açıklama |
| :--- | :--- | :--- |
| **Kullanıcı Web Arayüzü** | [http://localhost:8080](http://localhost:8080) | Doğa Dostu SPA & 3D WebGL Dashboard |
| **Swagger API Dokümantasyonu** | [http://localhost:8080/swagger-ui.html](http://localhost:8080/swagger-ui.html) | OpenAPI v3 Etkileşimli REST Dokümantasyonu |
| **WebSocket Canlı Telemetri** | `ws://localhost:8080/ws/telemetry` | Milisaniyelik Canlı Güç/Enerji Akışı |
| **Apache Kafka Broker** | `localhost:9092` | Dağıtık Olay Akış Platformu |
| **Apache Ignite Grid** | `localhost:10800` (Client), `18080` (HTTP) | In-Memory Veri Izgarası |
| **PostgreSQL Veritabanı** | `localhost:5432` (`volthome_db`) | İlişkisel Kalıcı Veritabanı |

---

## ⚙️ Çevre Değişkenleri (Environment Variables)

İsteğe bağlı olarak `.env` dosyası veya ortam değişkenleri ile özelleştirilebilir:

```properties
# Google Gemini API Anahtarı (Opsiyonel - Boş bırakılırsa yerel motor çalışır)
GEMINI_API_KEY=your_gemini_api_key_here

# E-Posta Bildirimleri için Gmail SMTP (Opsiyonel)
MAIL_USERNAME=your_email@gmail.com
MAIL_PASSWORD=your_app_password
```

---

## 📄 Lisans & Geliştirici

Bu proje sürdürülebilir enerji ve akıllı şehir sistemleri vizyonuyla geliştirilmiştir.  
&copy; 2026 **VoltHome Smart IoT Ecosystem**. Tüm hakları saklıdır.
