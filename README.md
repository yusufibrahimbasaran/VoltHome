# VoltHome — Real-Time IoT Energy Analytics & Budget Control

VoltHome, ev tipi akıllı cihazların anlık elektrik tüketimlerini izleyen, bütçe kotalarını takip eden, aşım durumlarında otomatik olarak cezalı tarifeye geçen ve yapay zeka destekli tasarruf önerilerini e-posta ile gönderen gerçek zamanlı bir IoT enerji analitiği ve bütçe denetleme platformudur.

---

## Proje Mimarisi

Sistem, olay güdümlü (event-driven) ve yüksek performanslı in-memory mimariyle tasarlanmış olup şu bileşenlerden oluşur:

1. **VoltHome Web App (Frontend):** Gerçek zamanlı tüketim grafiklerini (Chart.js), bütçe ilerlemelerini, cihaz durumlarını, sistem loglarını ve Gemini yapay zeka önerilerini gösteren modern ve dinamik Glassmorphic Dark SPA arayüzü.
2. **VoltHome Core (Backend):** Spring Boot 3.x tabanlı, REST API'leri sunan ve Kafka olaylarını asenkron olarak işleyen ana sunucu.
3. **VoltHome Telemetry Sensors (Simülatör):** Python ile yazılmış, Kafka kayıt topic'ini dinleyerek sisteme yeni eklenen evleri hafızasına alan ve her 2 saniyede bir rastgele (ve test amaçlı anormal limit aşımı yapacak şekilde) elektrik gücü (Watt) üreten IoT simülatörü.
4. **Apache Ignite (In-Memory Grid):** Yüksek frekanslı telemetri verilerinin PostgreSQL yükünü azaltacak şekilde in-memory (RAM) üzerinde biriktirildiği ve consecutive breach (ardışık limit aşımı anomalisi) durumlarının hafızada tutulduğu performans katmanı.
5. **Apache Kafka (Olay Altyapısı):** Cihaz kayıtları (`volthome-registration`) ve telemetri olaylarının (`volthome-telemetry`) aktığı mesaj kuyruğu.
6. **PostgreSQL (Kalıcı Veri):** Ev ve cihaz tanımlarının, snapshot tüketim geçmişlerinin, olay loglarının ve AI önerilerinin kalıcı olarak saklandığı veri tabanı.
7. **Google Gemini API:** Bütçe sınırına ulaşıldığında veya cihaz anomalilerinde Türkçe dilde kişiselleştirilmiş tasarruf tavsiyeleri üreten LLM entegrasyonu.

---

## Kullanılan Teknolojiler

- **Backend:** Java 17, Spring Boot 3.3.2, Spring Data JPA, Spring Kafka, Spring Mail
- **In-Memory Cache:** Apache Ignite 2.16.0
- **Veri Tabanı & Olay Yönetimi:** PostgreSQL 15, Apache Kafka (Confluent 7.4.0)
- **Simülatör:** Python 3.x (kafka-python-ng kütüphanesi ile)
- **Frontend:** Vanilla HTML5, CSS3 (Glassmorphism), Vanilla JavaScript, Chart.js
- **API Belgelendirme:** Springdoc OpenAPI (Swagger UI)
- **Konteynerleştirme:** Docker & Docker Compose

---

## Kurulum ve Çalıştırma Adımları

### 1. Docker Servislerinin Başlatılması
Altyapı bileşenlerini (Postgres, Kafka, Zookeeper, Ignite) ayağa kaldırmak için projenin kök dizininde terminalden şu komutu çalıştırın:
```bash
docker compose up -d
```
*Not: Apache Ignite HTTP API'sinin Spring Boot ile çakışmaması için Ignite HTTP portu `18080` portuna, Thin Client ise `10800` portuna yönlendirilmiştir.*

### 2. Spring Boot Backend (VoltHome Core) Başlatılması
Backend projesinin dizinine geçip (`core` klasörü), derleme ve çalıştırma adımlarını gerçekleştirin:
```bash
cd core
mvn clean package -DskipTests
java --add-exports=java.base/jdk.internal.misc=ALL-UNNAMED --add-exports=java.base/sun.nio.ch=ALL-UNNAMED --add-exports=java.management/com.sun.jmx.mbeanserver=ALL-UNNAMED --add-exports=jdk.internal.jvmstat/sun.jvmstat.monitor=ALL-UNNAMED --add-exports=java.base/sun.reflect.generics.reflectiveObjects=ALL-UNNAMED --add-opens=jdk.management/com.sun.management.internal=ALL-UNNAMED --add-opens=java.base/java.nio=ALL-UNNAMED --add-opens=java.base/java.io=ALL-UNNAMED --add-opens=java.base/java.util=ALL-UNNAMED --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.lang.invoke=ALL-UNNAMED --add-opens=java.base/java.util.concurrent=ALL-UNNAMED --add-opens=java.base/java.util.concurrent.locks=ALL-UNNAMED --add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED --add-opens=java.base/java.math=ALL-UNNAMED --add-opens=java.sql/java.sql=ALL-UNNAMED -jar target/volthome-core-1.0.0.jar
```
*Not: Java 17+ üzerinde Apache Ignite başlatılırken oluşan encapsulation hatalarını önlemek için yukarıdaki `--add-opens` ve `--add-exports` JVM argümanlarının kullanılması zorunludur.*

### 3. Telemetry Sensors Simülatörünün Başlatılması
IoT simülatör dizinine geçip (`telemetry-sensors` klasörü), Python simülasyonunu başlatın (gerekli kütüphaneler otomatik olarak yüklenecektir):
```bash
cd telemetry-sensors
python -u VoltHomeTelemetrySensors.py
```

### 4. Arayüzün ve API Dökümantasyonunun Açılması
- **Kullanıcı Arayüzü (Dashboard):** [http://localhost:8080/index.html](http://localhost:8080/index.html)
- **API Dokümantasyonu (Swagger):** [http://localhost:8080/swagger-ui.html](http://localhost:8080/swagger-ui.html)
- **E-posta Logları Fallback:** Bütçe aşımlarında veya cihaz anomalilerinde gönderilen e-postalar, SMTP konfigürasyonu girilmediğinde yerel olarak [logs/sent_emails.txt](file:///c:/Users/HP/.gemini/antigravity-ide/scratch/VoltHome/logs/sent_emails.txt) dosyasına loglanır.

---

## Çevre Değişkenleri (Environment Variables)

Aşağıdaki değişkenleri uygulamanın çalışma zamanında veya `.env` dosyası aracılığıyla ezebilirsiniz:
- `GEMINI_API_KEY`: Yapay zeka tasarruf önerileri için Google Gemini API Anahtarı. (Varsayılan olarak boş bırakıldığında uygulama local fallback önerileri sunar).
- `MAIL_USERNAME` / `MAIL_PASSWORD`: Bütçe aşımlarında gerçek mail atılması için Gmail SMTP kullanıcı adı ve uygulama şifresi.
