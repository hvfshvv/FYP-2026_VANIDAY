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
-- Table structure for table `merchant_availability`
--

DROP TABLE IF EXISTS `merchant_availability`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merchant_availability` (
  `availability_id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `day_of_week` enum('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`availability_id`),
  KEY `merchant_id` (`merchant_id`),
  CONSTRAINT `merchant_availability_ibfk_1` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`merchant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=157 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `merchant_availability`
--

LOCK TABLES `merchant_availability` WRITE;
/*!40000 ALTER TABLE `merchant_availability` DISABLE KEYS */;
INSERT INTO `merchant_availability` VALUES (1,9,'Monday','10:00:00','22:00:00',1),(2,9,'Tuesday','10:00:00','22:00:00',1),(3,9,'Wednesday','10:00:00','22:00:00',1),(4,1,'Monday','10:00:00','22:00:00',1),(5,1,'Tuesday','10:00:00','22:00:00',1),(6,1,'Wednesday','10:00:00','22:00:00',1),(7,1,'Thursday','10:00:00','22:00:00',1),(8,1,'Friday','10:00:00','22:00:00',1),(9,1,'Saturday','10:00:00','23:00:00',1),(10,1,'Sunday','10:00:00','23:00:00',1),(11,4,'Monday','09:00:00','21:00:00',1),(12,4,'Tuesday','09:00:00','21:00:00',1),(13,4,'Wednesday','09:00:00','21:00:00',1),(14,4,'Thursday','09:00:00','21:00:00',1),(15,4,'Friday','09:00:00','21:00:00',1),(16,4,'Saturday','09:00:00','22:00:00',1),(17,4,'Sunday','09:00:00','22:00:00',1),(18,2,'Monday','09:00:00','21:00:00',1),(19,2,'Tuesday','09:00:00','21:00:00',1),(20,2,'Wednesday','09:00:00','21:00:00',1),(21,2,'Thursday','09:00:00','21:00:00',1),(22,2,'Friday','09:00:00','21:00:00',1),(23,2,'Sunday','10:00:00','22:00:00',1),(24,2,'Saturday','10:00:00','22:00:00',1),(25,3,'Sunday','10:00:00','22:00:00',1),(26,3,'Saturday','10:00:00','22:00:00',1),(27,3,'Friday','10:00:00','22:00:00',1),(28,3,'Thursday','10:00:00','22:00:00',1),(29,3,'Wednesday','10:00:00','22:00:00',1),(30,3,'Tuesday','10:00:00','22:00:00',1),(31,3,'Monday','10:00:00','22:00:00',1),(32,5,'Sunday','10:00:00','22:00:00',1),(33,5,'Saturday','10:00:00','22:00:00',1),(34,5,'Friday','10:00:00','22:00:00',1),(35,5,'Thursday','10:00:00','22:00:00',1),(36,5,'Wednesday','10:00:00','22:00:00',1),(37,5,'Tuesday','10:00:00','22:00:00',1),(38,5,'Monday','10:00:00','22:00:00',1),(39,6,'Sunday','10:00:00','22:00:00',1),(40,6,'Saturday','10:00:00','22:00:00',1),(41,6,'Friday','10:00:00','22:00:00',1),(42,6,'Thursday','10:00:00','22:00:00',1),(43,6,'Wednesday','10:00:00','22:00:00',1),(44,6,'Tuesday','10:00:00','22:00:00',1),(45,6,'Monday','10:00:00','22:00:00',1),(46,7,'Sunday','10:00:00','22:00:00',1),(47,7,'Saturday','10:00:00','22:00:00',1),(48,7,'Friday','10:00:00','22:00:00',1),(49,7,'Thursday','10:00:00','22:00:00',1),(50,7,'Wednesday','10:00:00','22:00:00',1),(51,7,'Tuesday','10:00:00','22:00:00',1),(52,7,'Monday','10:00:00','22:00:00',1),(53,8,'Sunday','10:00:00','22:00:00',1),(54,8,'Saturday','10:00:00','22:00:00',1),(55,8,'Friday','10:00:00','22:00:00',1),(56,8,'Thursday','10:00:00','22:00:00',1),(57,8,'Wednesday','10:00:00','22:00:00',1),(58,8,'Tuesday','10:00:00','22:00:00',1),(59,8,'Monday','10:00:00','22:00:00',1),(60,9,'Sunday','10:00:00','22:00:00',1),(61,9,'Saturday','10:00:00','22:00:00',1),(62,9,'Friday','10:00:00','22:00:00',1),(63,9,'Thursday','10:00:00','22:00:00',1),(64,10,'Sunday','10:00:00','22:00:00',1),(65,10,'Saturday','10:00:00','22:00:00',1),(66,10,'Friday','10:00:00','22:00:00',1),(67,10,'Thursday','10:00:00','22:00:00',1),(68,10,'Wednesday','10:00:00','22:00:00',1),(69,10,'Tuesday','10:00:00','22:00:00',1),(70,10,'Monday','10:00:00','22:00:00',1),(71,11,'Sunday','10:00:00','22:00:00',1),(72,11,'Saturday','10:00:00','22:00:00',1),(73,11,'Friday','10:00:00','22:00:00',1),(74,11,'Thursday','10:00:00','22:00:00',1),(75,11,'Wednesday','10:00:00','22:00:00',1),(76,11,'Tuesday','10:00:00','22:00:00',1),(77,11,'Monday','10:00:00','22:00:00',1),(150,16,'Monday','10:00:00','22:00:00',1),(151,16,'Tuesday','10:00:00','22:00:00',1),(152,16,'Wednesday','10:00:00','22:00:00',1),(153,16,'Thursday','10:00:00','22:00:00',1),(154,16,'Friday','10:00:00','22:00:00',1),(155,16,'Saturday','10:00:00','23:00:00',1),(156,16,'Sunday','10:00:00','23:00:00',1);
/*!40000 ALTER TABLE `merchant_availability` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:39
