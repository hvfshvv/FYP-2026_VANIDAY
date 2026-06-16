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
-- Table structure for table `customer_voucher`
--

DROP TABLE IF EXISTS `customer_voucher`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_voucher` (
  `cv_id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL,
  `voucher_id` int NOT NULL,
  `claimed_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `status` enum('active','used','expired') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `used_at` datetime DEFAULT NULL,
  PRIMARY KEY (`cv_id`),
  KEY `idx_cv_customer` (`customer_id`),
  KEY `voucher_id` (`voucher_id`),
  KEY `idx_cv_customer_status` (`customer_id`,`status`),
  CONSTRAINT `customer_voucher_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `customer_voucher_ibfk_2` FOREIGN KEY (`voucher_id`) REFERENCES `voucher` (`voucher_id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_voucher`
--

LOCK TABLES `customer_voucher` WRITE;
/*!40000 ALTER TABLE `customer_voucher` DISABLE KEYS */;
INSERT INTO `customer_voucher` VALUES (2,13,2,'2026-05-21 15:36:48','used','2026-05-22 05:27:50'),(3,13,1,'2026-05-21 15:36:52','used','2026-05-22 05:04:37'),(4,13,3,'2026-05-21 15:37:00','active',NULL),(8,13,6,'2026-05-22 05:24:02','used','2026-05-26 05:53:28'),(9,18,1,'2026-05-22 05:51:26','used','2026-05-27 06:59:26'),(10,33,1,'2026-05-22 11:40:18','active',NULL),(11,33,2,'2026-05-22 11:40:21','active',NULL),(12,16,2,'2026-05-23 12:50:09','used','2026-05-23 12:52:07'),(13,33,7,'2026-05-23 14:33:29','active',NULL),(14,33,8,'2026-05-23 14:33:53','used','2026-05-23 14:35:32'),(15,18,2,'2026-05-23 14:51:58','active',NULL),(16,33,9,'2026-05-25 07:57:59','used','2026-05-25 07:59:00'),(17,33,10,'2026-05-25 08:09:51','used','2026-05-25 08:11:04'),(18,16,5,'2026-05-25 16:38:57','active',NULL),(19,34,1,'2026-05-28 04:27:31','active',NULL),(20,26,5,'2026-05-28 04:44:19','active',NULL);
/*!40000 ALTER TABLE `customer_voucher` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:58
