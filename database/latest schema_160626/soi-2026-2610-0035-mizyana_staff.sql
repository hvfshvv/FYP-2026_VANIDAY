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
-- Table structure for table `staff`
--

DROP TABLE IF EXISTS `staff`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff` (
  `staff_id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `full_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bio` text COLLATE utf8mb4_unicode_ci,
  `profile_image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `experience_years` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`staff_id`),
  KEY `merchant_id` (`merchant_id`),
  CONSTRAINT `staff_ibfk_1` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`merchant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=47 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff`
--

LOCK TABLES `staff` WRITE;
/*!40000 ALTER TABLE `staff` DISABLE KEYS */;
INSERT INTO `staff` VALUES (1,9,'Mary Lee','Hair Stylist','Skilled in Hair dressing!',NULL,3,1,'2026-05-14 06:56:59'),(2,9,'April Tan','Hair Stylist','Skilled in Haircuts and Hair colouring!',NULL,4,1,'2026-05-14 08:28:51'),(3,4,'Amanda Ang','Senior stylist','Specialises in trendy hair colouring  and balayage styles with a passion for helping customer achieve modern, stylish looks.',NULL,6,1,'2026-05-17 16:16:03'),(4,4,'Daniel Lee','Hair Treatment Specialist','Experienced in keratin and scalp treatments focused on hair repair and scalp health.',NULL,4,1,'2026-05-17 16:19:07'),(5,4,'Sara Lee','Junior Stylist','Friendly stylist skilled in basic colouring, washing, and blowdry services.',NULL,2,1,'2026-05-17 16:21:13'),(6,1,'Alex Tan','Senior Specialist','Experienced specialist at Glam Studio.',NULL,5,1,'2026-05-19 06:06:00'),(7,2,'Alex Tan','Senior Specialist','Experienced specialist at Luxe Nail Bar.',NULL,5,1,'2026-05-19 06:06:00'),(8,3,'Alex Tan','Senior Specialist','Experienced specialist at The Spa Sanctuary.',NULL,5,1,'2026-05-19 06:06:00'),(9,5,'Alex Tan','Senior Specialist','Experienced specialist at Glow Skin Clinic.',NULL,5,1,'2026-05-19 06:06:00'),(10,6,'Alex Tan','Senior Specialist','Experienced specialist at Zen Wellness Studio.',NULL,5,1,'2026-05-19 06:06:00'),(11,7,'Alex Toh','Senior Specialist','Experienced specialist at Pretty Lash Studio.',NULL,5,1,'2026-05-19 06:06:00'),(12,8,'Alex Tan','Senior Specialist','Experienced specialist at Goddess Beauty Bar.',NULL,5,1,'2026-05-19 06:06:00'),(13,10,'Alex Tan','Senior Specialist','Experienced specialist at Dewy Glow.',NULL,5,1,'2026-05-19 06:06:00'),(14,11,'Alex Tan','Senior Specialist','Experienced specialist at Velvet Bloom Studio.',NULL,6,1,'2026-05-19 06:06:00'),(21,1,'Jamie Lee','Service Specialist','Friendly service professional at Glam Studio.',NULL,3,1,'2026-05-19 06:06:00'),(22,2,'Jamie Lee','Service Specialist','Friendly service professional at Luxe Nail Bar.',NULL,3,1,'2026-05-19 06:06:00'),(23,3,'Jamie Lee','Service Specialist','Friendly service professional at The Spa Sanctuary.',NULL,3,1,'2026-05-19 06:06:00'),(24,5,'Jamie Lee','Service Specialist','Friendly service professional at Glow Skin Clinic.',NULL,3,1,'2026-05-19 06:06:00'),(25,6,'Jamie Lee','Service Specialist','Friendly service professional at Zen Wellness Studio.',NULL,3,1,'2026-05-19 06:06:00'),(26,7,'James Lee','Service Specialist','Friendly service professional at Pretty Lash Studio.',NULL,3,1,'2026-05-19 06:06:00'),(27,8,'Jamie Lee','Service Specialist','Friendly service professional at Goddess Beauty Bar.',NULL,3,1,'2026-05-19 06:06:00'),(28,10,'Jamie Lee','Service Specialist','Friendly service professional at Dewy Glow.',NULL,3,1,'2026-05-19 06:06:00'),(29,11,'Jamie Lee','Service Specialist','Friendly service professional at Velvet Bloom Studio.',NULL,3,1,'2026-05-19 06:06:00'),(36,16,'Amelia Tan','Senior Massage Therapist','Specialises in deep tissue and therapeutic massage with over 8 years of experience.',NULL,8,1,'2026-05-19 16:13:24'),(37,16,'Rachel Lim','Aromatherapy Specialist','Focuses on relaxation treatments and essential oil therapy for stress relief.',NULL,5,1,'2026-05-19 16:14:10'),(38,16,'Chloe Ong','Reflexology Therapist','Experienced in foot reflexology and tension relief treatments.',NULL,4,1,'2026-05-19 16:16:11'),(39,16,'Sophia Lee','Prenatal Massage Therapist','Certified therapist providing safe and comfortable prenatal treatments.',NULL,5,1,'2026-05-19 16:17:23'),(40,10,'Sally Sim','Facial Specialist','Experienced in facials.',NULL,4,1,'2026-05-19 17:23:05'),(41,9,'Joanne Lim','Senior stylist','Expert in hair services!',NULL,6,1,'2026-05-22 09:13:07'),(42,10,'Marie Soh','Senior specialist','Experienced specialist at Dewy Glow.',NULL,6,1,'2026-05-22 09:15:16'),(43,8,'Maria Sanchez','Nail Tech','Experienced in Nail Services',NULL,4,1,'2026-05-22 09:17:10'),(44,11,'Linda Chong','Nail Tech','Experienced in Basic Nail Services',NULL,3,1,'2026-05-22 09:21:19'),(45,11,'Mala Raj','Senior Nail Tech','Experienced in Advanced Nail Services. ',NULL,7,1,'2026-05-22 09:23:13'),(46,1,'Emily Chu','Hair Stylist','Professional at hair services',NULL,5,1,'2026-05-27 07:21:17');
/*!40000 ALTER TABLE `staff` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:48
