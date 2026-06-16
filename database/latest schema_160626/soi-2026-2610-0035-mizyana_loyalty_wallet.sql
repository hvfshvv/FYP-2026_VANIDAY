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
-- Table structure for table `loyalty_wallet`
--

DROP TABLE IF EXISTS `loyalty_wallet`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loyalty_wallet` (
  `wallet_id` int NOT NULL AUTO_INCREMENT,
  `customer_id` int NOT NULL,
  `points_balance` int DEFAULT '0',
  `cashback_balance` decimal(10,2) DEFAULT '0.00',
  `lifetime_points_earned` int DEFAULT '0',
  `lifetime_points_redeemed` int DEFAULT '0',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`wallet_id`),
  UNIQUE KEY `uq_loyalty_wallet_customer` (`customer_id`),
  KEY `loyalty_wallet_ibfk_1_idx` (`customer_id`),
  CONSTRAINT `loyalty_wallet_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`customer_id`)
) ENGINE=InnoDB AUTO_INCREMENT=247 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `loyalty_wallet`
--

LOCK TABLES `loyalty_wallet` WRITE;
/*!40000 ALTER TABLE `loyalty_wallet` DISABLE KEYS */;
INSERT INTO `loyalty_wallet` VALUES (1,28,55,0.00,55,0,'2026-05-22 11:33:07'),(2,18,34,0.00,34,0,'2026-05-28 06:30:42'),(8,16,15,0.00,65,50,'2026-05-25 16:38:36'),(12,13,156,0.00,156,0,'2026-05-27 08:47:34'),(57,33,13,0.00,159,150,'2026-05-27 08:55:12'),(63,11,12,0.00,12,0,'2026-05-22 11:33:07'),(65,17,6,0.00,6,0,'2026-05-22 11:33:07'),(66,12,27,0.00,27,0,'2026-05-24 13:30:19'),(68,27,5,0.00,5,0,'2026-05-22 11:33:07'),(96,10,0,0.00,0,0,'2026-05-23 13:54:59'),(97,25,0,0.00,0,0,'2026-05-23 13:54:59'),(98,26,30,0.00,30,0,'2026-06-04 04:20:27'),(99,30,35,0.00,35,0,'2026-06-10 15:57:13'),(122,34,10,0.00,10,0,'2026-05-28 02:33:48'),(157,35,0,0.00,0,0,'2026-05-25 08:12:53');
/*!40000 ALTER TABLE `loyalty_wallet` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:46
