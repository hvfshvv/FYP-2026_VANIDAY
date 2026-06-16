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
-- Table structure for table `platform_feedback`
--

DROP TABLE IF EXISTS `platform_feedback`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform_feedback` (
  `feedback_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int DEFAULT NULL,
  `customer_id` int NOT NULL,
  `rating` int NOT NULL,
  `feedback_type` enum('booking_experience','payment','qr_checkin','whatsapp','general') COLLATE utf8mb4_unicode_ci DEFAULT 'general',
  `feedback_text` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`feedback_id`),
  UNIQUE KEY `booking_id` (`booking_id`),
  KEY `platform_feedback_ibfk_2_idx` (`customer_id`),
  CONSTRAINT `platform_feedback_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`),
  CONSTRAINT `platform_feedback_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`customer_id`),
  CONSTRAINT `platform_feedback_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `platform_feedback`
--

LOCK TABLES `platform_feedback` WRITE;
/*!40000 ALTER TABLE `platform_feedback` DISABLE KEYS */;
INSERT INTO `platform_feedback` VALUES (1,42,18,5,'booking_experience','The booking process was simple and convenient. I could easily choose my preferred timing and service without any issues.','2026-05-22 10:33:33'),(2,47,18,4,'booking_experience','It was very easy to use !','2026-05-22 11:56:21'),(3,101,18,5,'booking_experience','Smooth and convenient','2026-05-27 07:36:57'),(4,95,18,5,'booking_experience','Easy and smooth','2026-05-27 07:51:56'),(5,92,33,5,'booking_experience','Fast and user-friendly','2026-05-27 07:58:12'),(6,83,33,5,'qr_checkin','The QR check-in process was fast and easy to use. It made checking in at the salon very convenient.','2026-05-27 08:07:35'),(7,39,13,5,'booking_experience','Booking the appointment was quick and hassle-free. I liked how easy it was to browse services and timings','2026-05-27 08:26:23'),(8,3,13,5,'qr_checkin','The QR check-in process was very smooth and convenient at the salon','2026-05-27 08:28:40'),(9,13,13,4,'general','Everything from browsing services to confirming the booking was smooth and straightforward.','2026-05-27 08:31:07'),(10,100,13,4,'booking_experience','Easy and convenient','2026-05-27 08:32:45'),(11,9,13,4,'booking_experience','Booking classes through Uniday was simple and convenient. I could easily view available time slots','2026-05-27 08:35:09'),(12,2,13,5,'general','Overall, Uniday provided a smooth and user-friendly booking experience','2026-05-27 08:37:56'),(13,26,13,5,'booking_experience','The platform was easy to navigate and booking an appointment only took a few minutes.','2026-05-27 08:38:54'),(14,21,13,5,'booking_experience','Booking classes through Uniday was simple and convenient. I could easily view available time slots.','2026-05-27 08:41:02'),(15,17,13,4,'general','The platform was easy to use and made scheduling appointments very convenient','2026-05-27 08:42:37'),(16,25,13,5,'general','Everything from browsing services to confirming the booking was smooth and straightforward','2026-05-27 08:47:34'),(17,34,18,4,'payment','Easy and fast payment','2026-05-27 09:05:02'),(18,75,18,5,'booking_experience','easy to book','2026-05-28 06:30:42');
/*!40000 ALTER TABLE `platform_feedback` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:28:07
