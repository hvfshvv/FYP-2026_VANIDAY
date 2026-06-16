-- MySQL dump 10.13  Distrib 8.0.38, for Win64 (x86_64)
--
-- Host: dft-fyp.mysql.database.azure.com    Database: soi-2026-2610-0035-mizyana
-- ------------------------------------------------------
-- Server version	8.0.44-azure

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `notification`
--

DROP TABLE IF EXISTS `notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `user_id` int NOT NULL,
  `merchant_id` int NOT NULL,
  `notification_type` enum('confirmation','reminder_24h','cancellation','reschedule','payment_receipt') COLLATE utf8mb4_unicode_ci NOT NULL,
  `channel` enum('email','whatsapp') COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','sent','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `scheduled_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  KEY `booking_id` (`booking_id`),
  KEY `user_id` (`user_id`),
  KEY `merchant_id` (`merchant_id`),
  CONSTRAINT `notification_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`),
  CONSTRAINT `notification_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `notification_ibfk_3` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`merchant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=53 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification`
--

LOCK TABLES `notification` WRITE;
/*!40000 ALTER TABLE `notification` DISABLE KEYS */;
INSERT INTO `notification` VALUES (1,89,34,9,'confirmation','email','Booking confirmation email for booking #89','sent','2026-05-24 14:21:34','2026-05-24 14:21:34'),(2,88,34,6,'cancellation','email','cancellation email to customer (019cuteunicorn@gmail.com) for booking #88','sent','2026-05-24 14:22:17','2026-05-24 14:22:17'),(3,88,34,6,'cancellation','email','cancellation email to merchant (zen@uniday.com) for booking #88','sent','2026-05-24 14:22:19','2026-05-24 14:22:19'),(4,89,34,9,'reschedule','email','reschedule email to customer (019cuteunicorn@gmail.com) for booking #89','sent','2026-05-24 14:22:40','2026-05-24 14:22:40'),(5,89,34,9,'reschedule','email','reschedule email to merchant (crowncomb@uniday.com) for booking #89','sent','2026-05-24 14:22:44','2026-05-24 14:22:44'),(6,90,26,3,'confirmation','email','Booking confirmation email for booking #90','failed','2026-05-25 03:52:57',NULL),(7,91,33,7,'confirmation','email','Booking confirmation email for booking #91','failed','2026-05-25 07:59:00',NULL),(8,92,33,7,'confirmation','email','Booking confirmation email for booking #92','failed','2026-05-25 08:11:04',NULL),(9,93,18,7,'confirmation','email','Booking confirmation email for booking #93','failed','2026-05-25 08:13:04',NULL),(10,94,18,7,'confirmation','email','Booking confirmation email for booking #94','failed','2026-05-25 08:21:50',NULL),(11,95,18,7,'confirmation','email','Booking confirmation email for booking #95','failed','2026-05-25 08:25:54',NULL),(12,96,13,11,'confirmation','email','Booking confirmation email for booking #96','failed','2026-05-26 05:53:28',NULL),(13,58,13,4,'reminder_24h','email','24-hour reminder email for booking #58','failed','2026-05-26 08:26:04',NULL),(14,58,13,4,'reminder_24h','email','24-hour reminder email for booking #58','failed','2026-05-26 08:35:27',NULL),(15,58,13,4,'reminder_24h','email','24-hour reminder email for booking #58','failed','2026-05-26 08:49:56',NULL),(16,58,13,4,'reminder_24h','email','24-hour reminder email for booking #58','failed','2026-05-26 08:59:40',NULL),(17,100,13,8,'confirmation','email','Booking confirmation email for booking #100','failed','2026-05-26 17:58:15',NULL),(18,101,18,1,'confirmation','email','Booking confirmation email for booking #101','failed','2026-05-27 06:59:26',NULL),(19,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 08:18:45',NULL),(20,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 08:50:50',NULL),(21,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 08:51:10',NULL),(22,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 08:55:28',NULL),(23,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 08:59:35',NULL),(24,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 08:59:35',NULL),(25,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 09:00:47',NULL),(26,96,13,11,'reminder_24h','email','24-hour reminder email for booking #96','failed','2026-05-27 09:00:47',NULL),(27,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 09:02:21',NULL),(28,96,13,11,'reminder_24h','email','24-hour reminder email for booking #96','failed','2026-05-27 09:02:21',NULL),(29,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 09:10:21',NULL),(30,96,13,11,'reminder_24h','email','24-hour reminder email for booking #96','failed','2026-05-27 09:10:21',NULL),(31,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 09:29:05',NULL),(32,96,13,11,'reminder_24h','email','24-hour reminder email for booking #96','failed','2026-05-27 09:29:05',NULL),(33,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 09:29:37',NULL),(34,96,13,11,'reminder_24h','email','24-hour reminder email for booking #96','failed','2026-05-27 09:29:37',NULL),(35,49,16,4,'reminder_24h','email','24-hour reminder email for booking #49','failed','2026-05-27 09:48:55',NULL),(36,96,13,11,'reminder_24h','email','24-hour reminder email for booking #96','failed','2026-05-27 09:48:55',NULL),(37,96,13,11,'reminder_24h','email','24-hour reminder email for booking #96','failed','2026-05-27 10:46:54',NULL),(38,102,34,5,'confirmation','email','Booking confirmation email for booking #102','sent','2026-05-28 02:33:53','2026-05-28 02:33:53'),(39,102,34,5,'cancellation','email','cancellation email to customer (019cuteunicorn@gmail.com) for booking #102','sent','2026-05-28 02:34:25','2026-05-28 02:34:25'),(40,102,34,5,'cancellation','email','cancellation email to merchant (glow@uniday.com) for booking #102','sent','2026-05-28 02:34:30','2026-05-28 02:34:30'),(41,89,34,9,'reschedule','email','reschedule email to customer (019cuteunicorn@gmail.com) for booking #89','sent','2026-05-28 02:34:56','2026-05-28 02:34:56'),(42,89,34,9,'reschedule','email','reschedule email to merchant (crowncomb@uniday.com) for booking #89','sent','2026-05-28 02:35:01','2026-05-28 02:35:01'),(43,103,26,11,'confirmation','email','Booking confirmation email for booking #103','failed','2026-05-28 04:04:19',NULL),(44,104,26,6,'confirmation','whatsapp','WhatsApp booking confirmation for booking #104','sent','2026-05-28 04:14:33','2026-05-28 04:14:33'),(45,104,26,6,'confirmation','email','Booking confirmation email for booking #104','failed','2026-05-28 04:14:33',NULL),(46,82,16,2,'reminder_24h','email','24-hour reminder email for booking #82','failed','2026-05-28 08:22:22',NULL),(47,82,16,2,'reminder_24h','email','24-hour reminder email for booking #82','failed','2026-05-28 08:27:48',NULL),(48,107,26,2,'confirmation','whatsapp','WhatsApp booking confirmation for booking #107','sent','2026-06-04 04:20:27','2026-06-04 04:20:27'),(49,107,26,2,'confirmation','email','Booking confirmation email for booking #107','failed','2026-06-04 04:20:27',NULL),(50,112,30,1,'confirmation','email','Booking confirmation email for booking #112','failed','2026-06-09 18:32:37',NULL),(51,114,30,4,'confirmation','email','confirmation email to customer (24048983@myrp.edu.sg) for booking #114','sent','2026-06-10 15:57:17','2026-06-10 15:57:17'),(52,114,30,4,'confirmation','email','confirmation email to merchant (hairrepublic@uniday.com) for booking #114','sent','2026-06-10 15:57:20','2026-06-10 15:57:20');
/*!40000 ALTER TABLE `notification` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:27
