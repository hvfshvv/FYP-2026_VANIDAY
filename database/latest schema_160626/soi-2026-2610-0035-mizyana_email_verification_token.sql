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
-- Table structure for table `email_verification_token`
--

DROP TABLE IF EXISTS `email_verification_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_verification_token` (
  `verification_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`verification_id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `idx_email_verification_user` (`user_id`),
  KEY `idx_email_verification_expires` (`expires_at`),
  CONSTRAINT `email_verification_token_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `email_verification_token`
--

LOCK TABLES `email_verification_token` WRITE;
/*!40000 ALTER TABLE `email_verification_token` DISABLE KEYS */;
INSERT INTO `email_verification_token` VALUES (1,34,'50a562d3c4effb3b27515d32cb339c4f20d3bbfaa222bd45e3da7379439680a4','2026-05-25 14:02:40',NULL,'2026-05-24 14:02:40'),(2,34,'c4559cbd32f12a410e1b0a3fe60d3d6c861e0338498b60d6bac467aade1defde','2026-05-25 14:09:21',NULL,'2026-05-24 14:09:21'),(3,34,'cca30f67409ceb61c4cc2b5e0bd55adeb1ea879559c011d117f4e02a7566199e','2026-05-25 14:09:23',NULL,'2026-05-24 14:09:23'),(4,34,'1ecb9eaa894a6a52c8e1dc5a2b2aa32d9168a7caecdbbdc4a8300541408efbb9','2026-05-25 14:09:23',NULL,'2026-05-24 14:09:23'),(5,34,'8a7d23c5d3797aa63479f6c737f36494fce99df58c55ca277a64540664e60060','2026-05-25 14:09:23',NULL,'2026-05-24 14:09:23'),(6,34,'a8bf9a6f1dc4b7da3c029f1a285e430e232f9bddb8ba7e9c75e483784d03d11c','2026-05-25 14:09:24',NULL,'2026-05-24 14:09:24'),(7,34,'3663aa1680773d4ed70b5ba6d4d603a6b78d472fcd31eb81740cb01c64f0d747','2026-05-25 14:09:24',NULL,'2026-05-24 14:09:24'),(8,34,'c4a370ddf9e7ad4c758b22fee11db1526724d28daaaade07266c755b185d433b','2026-05-25 14:09:24',NULL,'2026-05-24 14:09:24'),(9,34,'247245296e5407029bd0c203f3287b96eaeffb99cbb5bbf8a826d54e7e04e7c2','2026-05-25 14:09:24',NULL,'2026-05-24 14:09:24'),(10,35,'23f938b93acd4564e0c18b6d12af9586b4e87efb63600e3ae0423e04fe50597b','2026-05-26 08:12:53',NULL,'2026-05-25 08:12:53'),(11,35,'1e0f804541c0a569e7386f6a20b82806d3085d5e11d1bb351ddd1f484dd433cc','2026-05-26 08:13:11',NULL,'2026-05-25 08:13:11'),(12,35,'f1aed241da84ca59fee7d67e39c1640edfdb2a2fb0ba4e6e3bc62e00fcca7623','2026-05-26 08:13:21',NULL,'2026-05-25 08:13:21'),(13,35,'c14c9cce9eb5dc55af7e89fb59c62111978df67ac22e964ee6dfa5e708eac854','2026-05-26 08:13:22',NULL,'2026-05-25 08:13:22'),(14,35,'5d887fcfb64f20e3d89803db3cbf7bb76b6e66701871a65b859c163da34fe0a9','2026-05-26 08:13:23',NULL,'2026-05-25 08:13:23'),(15,35,'c3dd3ad1d87c45e06765ebb177d33ebc5919887d9a1dc01584a22a9bdeae21cb','2026-05-26 08:13:24',NULL,'2026-05-25 08:13:24');
/*!40000 ALTER TABLE `email_verification_token` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:28:01
