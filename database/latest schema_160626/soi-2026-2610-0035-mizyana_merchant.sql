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
-- Table structure for table `merchant`
--

DROP TABLE IF EXISTS `merchant`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merchant` (
  `merchant_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `merchant_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `business_uen` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `verification_notes` text COLLATE utf8mb4_unicode_ci,
  `submitted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `verified_at` datetime DEFAULT NULL,
  `verified_by` int DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `contact_no` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_featured` tinyint(1) DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`merchant_id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `business_uen` (`business_uen`),
  KEY `user_id` (`user_id`),
  KEY `fk_merchant_verified_by` (`verified_by`),
  CONSTRAINT `fk_merchant_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `merchant_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `merchant`
--

LOCK TABLES `merchant` WRITE;
/*!40000 ALTER TABLE `merchant` DISABLE KEYS */;
INSERT INTO `merchant` VALUES (1,2,'Glam Studio','glam@vaniday.com',NULL,'approved',NULL,'2026-05-16 19:20:01','2026-05-16 19:20:30',NULL,NULL,NULL,'10 Orchard Road, #02-01, Singapore 238888','91234567','/images/merchants/merchant_1_1779205342132.png',0,1,'2026-05-10 13:56:02'),(2,3,'Luxe Nail Bar','luxenail@uniday.com',NULL,'approved',NULL,'2026-05-16 19:20:01','2026-05-16 19:20:30',NULL,'Go-to nail studio for gel manis, nail art & pedicures at Ngee Ann City.','Nails','391 Orchard Road, #B2-38, Ngee Ann City, Singapore 238872','62345678','/images/merchants/merchant_2_1779203506785.png',0,1,'2026-05-12 14:07:58'),(3,4,'The Spa Sanctuary','spa@uniday.com',NULL,'approved',NULL,'2026-05-16 19:20:01','2026-05-16 19:20:30',NULL,'Award-winning urban spa in Raffles Place. Swedish, deep tissue & hot stone massages.','Spa','1 Raffles Place, #05-01, One Raffles Place, Singapore 048616','63456789','/images/merchants/merchant_3_1779204993130.png',0,1,'2026-05-12 14:11:54'),(4,5,'Hair Republic','hairrepublic@uniday.com',NULL,'approved',NULL,'2026-05-16 19:20:01','2026-05-16 19:20:30',NULL,'Top hair salon at Bugis Junction. Cuts, colour, balayage & keratin treatments.','Hair','200 Victoria Street, #03-22, Bugis Junction, Singapore 188021','64567890','/images/merchants/merchant_4_1779206075643.png',1,1,'2026-05-12 14:11:54'),(5,6,'Glow Skin Clinic','glow@uniday.com',NULL,'approved',NULL,'2026-05-16 19:20:01','2026-05-16 19:20:30',NULL,'Medical-grade facials, LED therapy & chemical peels at Tampines Mall.','Facial','4 Tampines Central 5, #04-09, Tampines Mall, Singapore 529510','65678901','/images/merchants/merchant_5_1779205772236.png',1,1,'2026-05-12 14:11:55'),(6,7,'Zen Wellness Studio','zen@uniday.com',NULL,'approved',NULL,'2026-05-16 19:20:01','2026-05-16 19:20:30',NULL,'Yoga, pilates, lymphatic massage & reflexology at Novena Square.','Wellness','238 Thomson Road, #01-01, Novena Square, Singapore 307683','66789012','/images/merchants/merchant_6_1779205520206.png',1,1,'2026-05-12 14:11:55'),(7,8,'Pretty Lash Studio','prettylash@uniday.com',NULL,'approved',NULL,'2026-05-16 19:20:01','2026-05-16 19:20:30',NULL,'Classic & volume lash extensions, lifts & brow services at Suntec City.','Aesthetics','3 Temasek Boulevard, #01-330, Suntec City Mall, Singapore 038983','67890123','/images/merchants/merchant_7_1779204562835.png',0,1,'2026-05-12 14:11:55'),(8,9,'Goddess Beauty Bar','goddess@uniday.com',NULL,'approved',NULL,'2026-05-16 19:20:01','2026-05-16 19:20:30',NULL,'Full makeup, waxing & brow services at VivoCity. Walk-ins welcome!','Body','1 Harbourfront Walk, #02-113, VivoCity, Singapore 098585','68901234','/images/merchants/merchant_8_1779203815653.png',0,1,'2026-05-12 14:11:55'),(9,14,'Crown & Comb Studio','crowncomb@uniday.com',NULL,'approved',NULL,'2026-05-16 19:20:01','2026-05-16 19:20:30',NULL,NULL,'Hair','15 Orchard Link, Singapore 238863','87873232','/images/merchants/merchant_9_1779203176245.png',0,1,'2026-05-14 04:34:30'),(10,19,'Dewy Glow','dewyglow@uniday.com','123456789','approved',NULL,'2026-05-16 19:20:01','2026-05-16 19:20:30',NULL,NULL,'Facial','8 Tampines Avenue 3, Singapore 529707','87878787','/images/merchants/merchant_10_1779204267391.png',0,1,'2026-05-16 15:16:05'),(11,20,'Velvet Bloom Studio','velvetbloom@uniday.com','202645819K','approved',NULL,'2026-05-16 19:24:00','2026-05-16 19:29:01',15,NULL,'Nails','18 Tanjong Pagar Road, #03-12, Singapore 088441','91234567','/images/merchants/merchant_11_1779204808992.png',0,1,'2026-05-16 19:24:00'),(12,21,'Lush Aura Beauty','lushaura@uniday.com','202647315R','rejected','The company is fake','2026-05-16 19:31:32','2026-05-16 19:32:12',15,NULL,'Massage','12 Marina Boulevard, #02-18, Singapore 018982','98765432',NULL,0,1,'2026-05-16 19:31:32'),(13,22,'Luna Beauty Lounge','lunabeauty@uniday.com','202418736M','rejected','haha lol','2026-05-18 04:22:35','2026-05-18 04:23:50',15,NULL,'Wellness','12 Holland Avenue, #03-18, Singapore 278995','91237846',NULL,0,1,'2026-05-18 04:22:35'),(14,23,'Muse Hair Atelier','musehair@uniday.com','202397421K','rejected','lol','2026-05-18 05:15:34','2026-05-18 05:16:42',15,NULL,'Hair','45 Bugis Street, #02-11, Singapore 188903','96725410',NULL,0,1,'2026-05-18 05:15:34'),(15,24,'Diamond Studio','karislim2424@gmail.com','121212121L','approved',NULL,'2026-05-18 08:04:13','2026-06-09 17:56:26',15,NULL,'Aesthetics','22 Tanah Merah 232322','4444444444',NULL,0,1,'2026-05-18 08:04:13'),(16,29,'Minnie\'s Massage','minnie@uniday.com','98766789A','approved',NULL,'2026-05-19 16:05:33','2026-05-19 16:06:16',15,NULL,'Massage','22 Orchard Centre, Sinagpore 630022','99123456','/images/merchants/merchant_16_1779206818149.png',0,1,'2026-05-19 16:05:33');
/*!40000 ALTER TABLE `merchant` ENABLE KEYS */;
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
