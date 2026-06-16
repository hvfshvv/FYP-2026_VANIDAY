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
-- Table structure for table `loyalty_reward`
--

DROP TABLE IF EXISTS `loyalty_reward`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loyalty_reward` (
  `reward_id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `points_cost` int NOT NULL,
  `min_tier` enum('Bronze','Silver','Gold','Platinum') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Bronze',
  `value_label` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `discount_type` enum('percent','fixed_amount') COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_value` decimal(10,2) NOT NULL,
  `min_spend` decimal(10,2) DEFAULT NULL,
  `validity_months` int NOT NULL DEFAULT '3',
  `is_active` tinyint(1) DEFAULT '1',
  `display_order` int DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`reward_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `loyalty_reward`
--

LOCK TABLES `loyalty_reward` WRITE;
/*!40000 ALTER TABLE `loyalty_reward` DISABLE KEYS */;
INSERT INTO `loyalty_reward` VALUES (1,'S$5 Beauty Voucher','Use this on your next paid booking.',50,'Bronze','S$5 off','fixed_amount',5.00,NULL,3,1,10,'2026-05-25 07:06:54'),(2,'10% Self-care Voucher','A starter reward for regular members.',80,'Bronze','10% off','percent',10.00,NULL,3,1,20,'2026-05-25 07:06:54'),(3,'S$12 Silver Treat','A stronger voucher unlocked at Silver tier.',110,'Silver','S$12 off','fixed_amount',12.00,NULL,3,1,30,'2026-05-25 07:06:54'),(4,'S$25 Gold Glow Voucher','A premium voucher for Gold members and above.',220,'Gold','S$25 off','fixed_amount',25.00,NULL,3,1,40,'2026-05-25 07:06:54'),(5,'S$40 Platinum Privilege','The top loyalty voucher for the biggest fans.',350,'Platinum','S$40 off','fixed_amount',40.00,NULL,3,1,50,'2026-05-25 07:06:54'),(6,'10% off next booking!','Use this on your next paid booking!',25,'Bronze','10% off','percent',10.00,25.00,3,1,1,'2026-05-25 07:40:22');
/*!40000 ALTER TABLE `loyalty_reward` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:28:13
