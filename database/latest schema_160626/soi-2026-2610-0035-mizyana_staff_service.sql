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
-- Table structure for table `staff_service`
--

DROP TABLE IF EXISTS `staff_service`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff_service` (
  `staff_service_id` int NOT NULL AUTO_INCREMENT,
  `staff_id` int NOT NULL,
  `service_id` int NOT NULL,
  PRIMARY KEY (`staff_service_id`),
  UNIQUE KEY `staff_id` (`staff_id`,`service_id`),
  KEY `service_id` (`service_id`),
  CONSTRAINT `staff_service_ibfk_1` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`staff_id`),
  CONSTRAINT `staff_service_ibfk_2` FOREIGN KEY (`service_id`) REFERENCES `service` (`service_id`)
) ENGINE=InnoDB AUTO_INCREMENT=189 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff_service`
--

LOCK TABLES `staff_service` WRITE;
/*!40000 ALTER TABLE `staff_service` DISABLE KEYS */;
INSERT INTO `staff_service` VALUES (1,2,39),(2,2,40),(5,3,14),(4,3,15),(3,3,16),(180,4,14),(181,4,17),(182,4,18),(10,5,14),(9,5,15),(11,6,1),(12,6,2),(13,6,3),(14,7,4),(15,7,5),(16,7,6),(17,7,7),(18,7,8),(19,8,9),(20,8,10),(21,8,11),(22,8,12),(23,8,13),(24,9,19),(25,9,20),(26,9,21),(27,9,22),(28,9,23),(29,10,24),(30,10,25),(31,10,26),(32,10,27),(33,10,28),(34,11,29),(35,11,30),(36,11,31),(37,11,32),(38,11,33),(39,12,34),(40,12,35),(41,12,36),(42,12,37),(43,12,38),(44,21,1),(45,21,2),(46,21,3),(47,22,4),(48,22,5),(49,22,6),(50,22,7),(51,22,8),(52,23,9),(53,23,10),(54,23,11),(55,23,12),(56,23,13),(57,24,19),(58,24,20),(59,24,21),(60,24,22),(61,24,23),(62,25,24),(63,25,25),(64,25,26),(65,25,27),(66,25,28),(185,26,29),(188,26,30),(186,26,31),(187,26,33),(72,27,34),(73,27,35),(74,27,36),(75,27,37),(76,27,38),(142,36,44),(139,36,45),(138,36,46),(141,36,47),(140,36,48),(144,37,44),(143,37,46),(148,38,44),(146,38,45),(145,38,46),(147,38,48),(153,39,44),(150,39,45),(149,39,46),(152,39,47),(151,39,48),(156,40,49),(154,40,51),(155,40,52),(157,41,39),(159,41,40),(160,41,41),(161,41,42),(158,41,43),(166,42,49),(162,42,50),(163,42,51),(165,42,52),(164,42,53),(167,43,59),(168,44,55),(169,44,56),(170,44,57),(172,45,54),(173,45,55),(174,45,56),(175,45,57),(171,45,58),(184,46,1);
/*!40000 ALTER TABLE `staff_service` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:29
