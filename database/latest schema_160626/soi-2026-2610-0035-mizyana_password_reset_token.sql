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
-- Table structure for table `password_reset_token`
--

DROP TABLE IF EXISTS `password_reset_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_reset_token` (
  `reset_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`reset_id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `idx_password_reset_user` (`user_id`),
  KEY `idx_password_reset_expires` (`expires_at`),
  CONSTRAINT `password_reset_token_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_reset_token`
--

LOCK TABLES `password_reset_token` WRITE;
/*!40000 ALTER TABLE `password_reset_token` DISABLE KEYS */;
INSERT INTO `password_reset_token` VALUES (1,24,'4146e919395feb59b98764b4db94153b5292b487a48a5889dbc7173268209f8a','2026-05-24 14:15:27',NULL,'2026-05-24 13:15:27'),(2,24,'b93602cabf13b228ffb43aac6cdcf76db498b8c8e4b0ca9cec3e9779e148cb60','2026-05-24 14:16:20','2026-05-24 13:16:31','2026-05-24 13:16:20'),(3,24,'068edbe3d370509203f9f8dd6f9a220b9cb302b359e7f5458319e17936010f35','2026-05-24 14:17:16',NULL,'2026-05-24 13:17:16'),(4,30,'a070936af4631bc1653895ee4df3875ac1fda11a7fdcd612999edbedc3b1387e','2026-05-24 14:19:03',NULL,'2026-05-24 13:19:03'),(5,15,'7a3e60257d2eef743ab751dc6078ad247f793c01a8f34bbc26d21bc7d5c35e73','2026-05-24 14:21:52',NULL,'2026-05-24 13:21:52'),(6,12,'5fe36f2ca79fce85fe0785d899418542a8306b9f3dd6aa2845d7294a5a99fb12','2026-05-24 15:07:39',NULL,'2026-05-24 14:07:39'),(7,34,'e5e2e2b441df6c261847634906c17d0168ed50e7c15dabfd778b357443f66b02','2026-05-24 15:13:28','2026-05-24 14:13:54','2026-05-24 14:13:28'),(8,34,'2d8312bac706e4c73e38c17d1a9a253f0ccb02db284db6cfa8b6155b6ddb48e3','2026-05-25 08:40:45',NULL,'2026-05-25 07:40:45'),(9,35,'6dc7cbd62c4b8948f41726930e3b90885593a71e976ba363670ccba52dc2b9fd','2026-05-25 16:51:55','2026-05-25 15:52:04','2026-05-25 15:51:55'),(10,30,'f61ca122978f7ad7b2881d5b4df8409e63051c62ff253354ec80d37b6cb8035e','2026-06-09 18:59:18','2026-06-09 17:59:26','2026-06-09 17:59:18');
/*!40000 ALTER TABLE `password_reset_token` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:56
