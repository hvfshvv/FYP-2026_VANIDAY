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
-- Table structure for table `admin_action_log`
--

DROP TABLE IF EXISTS `admin_action_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_action_log` (
  `admin_log_id` int NOT NULL AUTO_INCREMENT,
  `admin_id` int NOT NULL,
  `action_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_table` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_id` int DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`admin_log_id`),
  KEY `admin_id` (`admin_id`),
  CONSTRAINT `admin_action_log_ibfk_1` FOREIGN KEY (`admin_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin_action_log`
--

LOCK TABLES `admin_action_log` WRITE;
/*!40000 ALTER TABLE `admin_action_log` DISABLE KEYS */;
INSERT INTO `admin_action_log` VALUES (1,15,'APPROVE_MERCHANT','merchant',11,'Approved merchant application.','2026-05-16 19:29:01'),(2,15,'REJECT_MERCHANT','merchant',12,'The company is fake','2026-05-16 19:32:12'),(3,15,'REJECT_MERCHANT','merchant',13,'haha lol','2026-05-18 04:23:50'),(4,15,'REJECT_MERCHANT','merchant',14,'lol','2026-05-18 05:16:42'),(5,15,'DISABLE_USER','users',10,'Set user status to suspended.','2026-05-19 09:45:59'),(6,15,'ENABLE_USER','users',10,'Set user status to active.','2026-05-19 09:46:13'),(7,15,'DISABLE_USER','users',18,'Set user status to suspended.','2026-05-19 10:04:34'),(8,15,'ENABLE_USER','users',18,'Set user status to active.','2026-05-19 10:04:40'),(9,15,'DISABLE_USER','users',18,'Set user status to suspended.','2026-05-19 10:04:47'),(10,15,'ENABLE_USER','users',18,'Set user status to active.','2026-05-19 10:04:55'),(11,15,'APPROVE_MERCHANT','merchant',16,'Approved merchant application.','2026-05-19 16:06:16'),(12,15,'DISABLE_MERCHANT','merchant',4,'Disabled merchant account.','2026-05-20 05:53:56'),(13,15,'ENABLE_MERCHANT','merchant',4,'Enabled merchant account.','2026-05-20 06:37:18'),(14,15,'DISABLE_MERCHANT','merchant',4,'Disabled merchant account.','2026-05-20 06:37:27'),(15,15,'ENABLE_MERCHANT','merchant',4,'Enabled merchant account.','2026-05-20 06:39:01'),(16,15,'DISABLE_USER','users',10,'Disabled user account. Reason: Suspicious account activity.','2026-05-22 12:33:34'),(17,15,'DISABLE_MERCHANT','merchant',3,'Disabled merchant account. Reason: Fraudulent promotions/vouchers.','2026-05-22 12:36:08'),(18,15,'ENABLE_MERCHANT','merchant',3,'Enabled merchant account.','2026-05-22 12:36:51'),(19,15,'ENABLE_USER','users',10,'Enabled user account.','2026-05-22 12:46:30'),(20,15,'DISABLE_USER','users',10,'Disabled user account. Reason: Suspicious account activity.','2026-05-22 12:46:39'),(21,15,'DISABLE_MERCHANT','merchant',3,'Disabled merchant account. Reason: Fraudulent promotions/vouchers.','2026-05-22 12:47:15'),(22,15,'ENABLE_MERCHANT','merchant',3,'Enabled merchant account.','2026-05-22 12:48:08'),(23,15,'APPROVE_MERCHANT','merchant',15,'Approved merchant application.','2026-06-09 17:56:26');
/*!40000 ALTER TABLE `admin_action_log` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:23
