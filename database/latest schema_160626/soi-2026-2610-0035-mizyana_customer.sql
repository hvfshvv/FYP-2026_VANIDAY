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
-- Table structure for table `customer`
--

DROP TABLE IF EXISTS `customer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer` (
  `customer_id` int NOT NULL,
  `user_id` int NOT NULL,
  `full_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`customer_id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `fk_customer_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer`
--

LOCK TABLES `customer` WRITE;
/*!40000 ALTER TABLE `customer` DISABLE KEYS */;
INSERT INTO `customer` VALUES (10,10,'John Doe','johndoe@mail.com','91231234','2005-07-07','2026-05-12 15:11:16'),(11,11,'Mary Tan','mary@gmail.com','98765432','2005-06-06','2026-05-13 04:24:17'),(12,12,'ka','ka@gmail.com','85043408','2005-05-05','2026-05-13 07:59:07'),(13,13,'mary tan','mary@mary.com','+6587654321','2005-04-04','2026-05-13 09:48:49'),(16,16,'Diane Low','diane@diane.com','99998888','2005-03-03','2026-05-14 09:38:25'),(17,17,'May tan','may@may.com','912345678','2005-01-01','2026-05-14 09:48:20'),(18,18,'Lilly Lim','lilly@lilly.com','91231234','2005-02-02','2026-05-16 09:58:09'),(25,25,'WhatsApp Customer 6589483241','whatsapp_6589483241@uniday.local',NULL,NULL,'2026-05-19 15:10:02'),(26,26,'Aisyah','aisyah@aisyah.com','+6589483241','2005-08-08','2026-05-18 09:20:50'),(27,27,'Fathima','fathima123@gmail.com','+6588880000','2005-09-09','2026-05-18 13:35:46'),(28,28,'mimi tan','mimi@mimi.com','+6598760001','2005-10-10','2026-05-18 14:59:29'),(30,30,'kaa','24048983@myrp.edu.sg','4444444444444','2026-05-21','2026-05-21 04:23:03'),(33,33,'sabrina','sabrina@sabrina.com','98796789','2007-01-22','2026-05-22 09:38:30'),(34,34,'karis ','019cuteunicorn@gmail.com','4444444444444','2026-05-16','2026-05-24 14:02:40'),(35,35,'test email','kk@gmail.com','+6585043408','2026-05-24','2026-05-25 08:12:53');
/*!40000 ALTER TABLE `customer` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:16
