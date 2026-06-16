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
-- Table structure for table `promotion`
--

DROP TABLE IF EXISTS `promotion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `promotion` (
  `promo_id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `service_id` int DEFAULT NULL,
  `voucher_id` int DEFAULT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `discount_pct` decimal(5,2) DEFAULT NULL,
  `min_spend` decimal(10,2) DEFAULT NULL,
  `offer_text` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `applicable_days` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `approval_status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'approved',
  `submitted_by_merchant` tinyint(1) NOT NULL DEFAULT '1',
  `rejection_reason` text COLLATE utf8mb4_unicode_ci,
  `approved_by_admin_id` int DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `submitted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`promo_id`),
  KEY `merchant_id` (`merchant_id`),
  KEY `voucher_id` (`voucher_id`),
  CONSTRAINT `promotion_ibfk_1` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`merchant_id`),
  CONSTRAINT `promotion_ibfk_2` FOREIGN KEY (`voucher_id`) REFERENCES `voucher` (`voucher_id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `promotion`
--

LOCK TABLES `promotion` WRITE;
/*!40000 ALTER TABLE `promotion` DISABLE KEYS */;
INSERT INTO `promotion` VALUES (1,1,NULL,NULL,'20% Off Facials','Book a facial this month and save 20%!',NULL,NULL,NULL,NULL,NULL,'2026-05-01','2026-05-31',1,'approved',1,NULL,NULL,NULL,'2026-05-20 01:46:45'),(2,2,NULL,NULL,'Mani-Pedi Bundle','Gel mani + pedi at a bundle price!',15.00,NULL,NULL,NULL,NULL,'2026-05-01','2026-06-30',1,'approved',1,NULL,NULL,NULL,'2026-05-20 01:46:45'),(3,3,NULL,NULL,'Weekday Wellness','Book any massage Mon–Thu and save 25%',25.00,NULL,NULL,'mon,tue,wed,thu',NULL,'2026-05-01','2026-07-31',1,'approved',1,NULL,NULL,NULL,'2026-05-20 01:46:45'),(4,4,NULL,NULL,'First Visit 20% Off','First-timers get 20% off any service!',20.00,NULL,NULL,NULL,NULL,'2026-05-01','2026-08-31',1,'approved',1,NULL,NULL,NULL,'2026-05-20 01:46:45'),(5,5,NULL,NULL,'Hydra Facial Package','Buy 3 Hydra Facials, save 30%!',30.00,NULL,NULL,NULL,NULL,'2026-05-01','2026-06-30',1,'approved',1,NULL,NULL,NULL,'2026-05-20 01:46:45'),(6,6,NULL,NULL,'5-Class Wellness Pass','Buy 5 classes and save 20%',20.00,NULL,NULL,NULL,NULL,'2026-05-01','2026-07-31',1,'approved',1,NULL,NULL,NULL,'2026-05-20 01:46:45'),(7,7,NULL,NULL,'New Client Lash Promo','First-time lash set at 15% off!',15.00,NULL,NULL,NULL,NULL,'2026-05-01','2026-08-31',1,'approved',1,NULL,NULL,NULL,'2026-05-20 01:46:45'),(8,8,NULL,NULL,'Bridal Package Deal','10% off bridal makeup + free trial!',10.00,NULL,NULL,NULL,NULL,'2026-05-01','2026-12-31',1,'approved',1,NULL,NULL,NULL,'2026-05-20 01:46:45'),(10,4,NULL,NULL,'10% off ONLY ON Wednesdays !','get 10% off on any service at Hair Republic (any location) on Wednesdays only ! Limited time only!',10.00,NULL,'10% off on Wednesdays !','wed','/images/promotions/hairrepublic-promo-weds10.png','2026-05-20','2026-07-20',1,'approved',1,NULL,15,'2026-05-21 15:42:35','2026-05-20 01:48:52'),(11,9,NULL,NULL,'Glow & Go Hair Revival','Refresh your look with vibrant colours and nourishing hair treatments at Crown & Comb Studio. Perfect for a self-care glow up before your next event or holiday ✨',15.00,80.00,'15% off all hair colouring & treatment packages','mon,tue,wed,thu,fri,sat',NULL,'2026-06-01','2026-06-30',0,'pending',1,NULL,NULL,NULL,'2026-05-26 08:31:34');
/*!40000 ALTER TABLE `promotion` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:28:11
