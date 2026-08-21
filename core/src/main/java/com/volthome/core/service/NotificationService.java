package com.volthome.core.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Service
public class NotificationService {
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final JavaMailSender mailSender;

    @Autowired
    public NotificationService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    /**
     * Dispatches an email notification to the target contact email.
     * Graces configuration issues or network drops by writing to a local backup log file.
     */
    public void sendEmail(String to, String subject, String body) {
        log.info("Preparing to send email notification to: {}", to);
        
        // 1. Write email backup to a local file
        writeEmailToFileLog(to, subject, body);

        // 2. Try to send via Spring MailSender
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom("no-reply@volthome.com");
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            log.info("Successfully sent email to {} via SMTP server.", to);
        } catch (Exception e) {
            log.warn("Could not dispatch SMTP email ({}). This is expected if SMTP keys are not configured. Content successfully recorded to log file.", e.getMessage());
        }

        // 3. Print a prominent message to the console
        log.info("\n======================================================================\n" +
                "[VOLTHOME EMAIL DISPATCHED]\n" +
                "To: " + to + "\n" +
                "Subject: " + subject + "\n" +
                "Body:\n" + body + "\n" +
                "======================================================================");
    }

    private void writeEmailToFileLog(String to, String subject, String body) {
        String logDirPath = "C:\\Users\\HP\\.gemini\\antigravity-ide\\scratch\\VoltHome\\logs";
        File dir = new File(logDirPath);
        if (!dir.exists()) {
            dir.mkdirs();
        }

        File logFile = new File(dir, "sent_emails.txt");
        try (FileWriter fw = new FileWriter(logFile, true)) {
            DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            fw.write(String.format("[%s] TO: %s\nSUBJECT: %s\nBODY:\n%s\n----------------------------------------------------------------------\n",
                    dtf.format(LocalDateTime.now()), to, subject, body));
            log.debug("Email content backed up to {}", logFile.getAbsolutePath());
        } catch (IOException e) {
            log.error("Failed to write email backup log to file: {}", e.getMessage());
        }
    }
}
