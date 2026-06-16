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
-- Table structure for table `featured_listing`
--

DROP TABLE IF EXISTS `featured_listing`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `featured_listing` (
  `listing_id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `promo_id` int DEFAULT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `display_order` int DEFAULT '0',
  `is_visible` tinyint(1) DEFAULT '1',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`listing_id`),
  KEY `merchant_id` (`merchant_id`),
  KEY `promo_id` (`promo_id`),
  CONSTRAINT `featured_listing_ibfk_1` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`merchant_id`),
  CONSTRAINT `featured_listing_ibfk_2` FOREIGN KEY (`promo_id`) REFERENCES `promotion` (`promo_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `featured_listing`
--

LOCK TABLES `featured_listing` WRITE;
/*!40000 ALTER TABLE `featured_listing` DISABLE KEYS */;
INSERT INTO `featured_listing` VALUES (1,1,1,'Glam Studio — May Deals','Top-rated salon with exclusive May promotions!',NULL,0,0,NULL,NULL,'2026-05-10 13:56:02'),(2,2,2,'Luxe Nail Bar — Nail Goals ✨','Go-to nail studio for gel manis, nail art & pedicures at Ngee Ann City.',NULL,0,1,NULL,NULL,'2026-05-12 14:11:54'),(3,3,3,'The Spa Sanctuary — Total Bliss ?','Award-winning urban spa in Raffles Place. Swedish, deep tissue & hot stone massages.',NULL,0,0,NULL,NULL,'2026-05-12 14:11:54'),(4,4,4,'Hair Republic — Expert Hair Studio ✂️','Top hair salon at Bugis Junction. Cuts, colour, balayage & keratin treatments.','/images/merchants/hair-republic.jpg',0,1,NULL,NULL,'2026-05-12 14:11:55'),(5,5,5,'Glow Skin Clinic — Glass Skin Experts ✨','Medical-grade facials, LED therapy & chemical peels at Tampines Mall.','/images/merchants/glow-skin-clinic.jpg',0,1,NULL,NULL,'2026-05-12 14:11:55'),(6,6,6,'Zen Wellness Studio — Mind & Body ?','Yoga, pilates, lymphatic massage & reflexology at Novena Square.','/images/merchants/zen-wellness-studio.jpg',0,0,NULL,NULL,'2026-05-12 14:11:55'),(8,8,8,'Goddess Beauty Bar — Glow Up ?','Full makeup, waxing & brow services at VivoCity. Walk-ins welcome!',NULL,0,1,NULL,NULL,'2026-05-12 14:11:55'),(9,9,NULL,'Crown & Comb Studio','Featured Hair on Uniday.',NULL,0,1,NULL,NULL,'2026-05-19 14:38:35'),(10,7,NULL,'Pretty Lash Studio','Featured Aesthetics on Uniday.',NULL,0,1,NULL,NULL,'2026-05-20 07:13:00');
/*!40000 ALTER TABLE `featured_listing` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:28:02
