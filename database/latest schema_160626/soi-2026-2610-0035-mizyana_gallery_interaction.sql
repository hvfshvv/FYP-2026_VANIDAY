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
-- Table structure for table `gallery_interaction`
--

DROP TABLE IF EXISTS `gallery_interaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `gallery_interaction` (
  `interaction_id` int NOT NULL AUTO_INCREMENT,
  `post_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `interaction_type` enum('like','save','report') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` enum('Inappropriate content','Offensive language','Spam','Irrelevant content','Other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('active','ignored') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`interaction_id`),
  UNIQUE KEY `uq_gallery_interaction` (`post_id`,`customer_id`,`interaction_type`),
  KEY `idx_gallery_interaction_type` (`interaction_type`,`status`),
  KEY `customer_id` (`customer_id`),
  CONSTRAINT `gallery_interaction_ibfk_1` FOREIGN KEY (`post_id`) REFERENCES `gallery_post` (`post_id`) ON DELETE CASCADE,
  CONSTRAINT `gallery_interaction_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `gallery_interaction`
--

LOCK TABLES `gallery_interaction` WRITE;
/*!40000 ALTER TABLE `gallery_interaction` DISABLE KEYS */;
INSERT INTO `gallery_interaction` VALUES (4,7,13,'like',NULL,'active','2026-06-13 20:21:31'),(5,7,13,'save',NULL,'active','2026-06-13 20:21:35'),(6,8,18,'save',NULL,'active','2026-06-13 20:23:18');
/*!40000 ALTER TABLE `gallery_interaction` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:40
