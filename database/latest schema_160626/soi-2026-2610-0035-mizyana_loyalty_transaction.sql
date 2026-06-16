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
-- Table structure for table `loyalty_transaction`
--

DROP TABLE IF EXISTS `loyalty_transaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `loyalty_transaction` (
  `loyalty_transaction_id` int NOT NULL AUTO_INCREMENT,
  `wallet_id` int NOT NULL,
  `booking_id` int DEFAULT NULL,
  `transaction_type` enum('earn_points','redeem_points','earn_cashback','use_cashback','refund_cashback') COLLATE utf8mb4_unicode_ci NOT NULL,
  `points_amount` int DEFAULT NULL,
  `cashback_amount` decimal(10,2) DEFAULT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`loyalty_transaction_id`),
  UNIQUE KEY `uq_loyalty_booking_transaction` (`booking_id`,`transaction_type`),
  KEY `wallet_id` (`wallet_id`),
  CONSTRAINT `loyalty_transaction_ibfk_1` FOREIGN KEY (`wallet_id`) REFERENCES `loyalty_wallet` (`wallet_id`),
  CONSTRAINT `loyalty_transaction_ibfk_2` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`)
) ENGINE=InnoDB AUTO_INCREMENT=96 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `loyalty_transaction`
--

LOCK TABLES `loyalty_transaction` WRITE;
/*!40000 ALTER TABLE `loyalty_transaction` DISABLE KEYS */;
INSERT INTO `loyalty_transaction` VALUES (1,1,46,'earn_points',55,NULL,'Earned 55 points for booking #46','2026-05-18 15:00:10'),(2,2,47,'earn_points',5,NULL,'Earned 5 points for booking #47','2026-05-19 07:11:17'),(3,8,48,'earn_points',7,NULL,'Earned 7 points for booking #48','2026-05-20 05:22:35'),(4,8,49,'earn_points',12,NULL,'Earned 12 points for booking #49','2026-05-20 05:25:38'),(5,12,58,'earn_points',4,NULL,'Earned 4 points for booking #58','2026-05-21 16:04:22'),(6,12,63,'earn_points',3,NULL,'Earned 3 points for booking #63','2026-05-22 04:43:34'),(7,12,66,'earn_points',3,NULL,'Earned 3 points for booking #66','2026-05-22 05:04:36'),(8,12,72,'earn_points',6,NULL,'Earned 6 points for booking #72','2026-05-22 05:27:50'),(9,2,75,'earn_points',2,NULL,'Earned 2 points for booking #75','2026-05-22 09:33:48'),(10,57,76,'earn_points',2,NULL,'Earned 2 points for booking #76','2026-05-22 09:39:24'),(11,57,78,'earn_points',3,NULL,'Earned 3 points for booking #78','2026-05-22 09:53:16'),(15,12,1,'earn_points',3,NULL,'Earned 3 points for booking #1','2026-05-22 11:32:19'),(16,12,2,'earn_points',8,NULL,'Earned 8 points for booking #2','2026-05-22 11:32:19'),(17,12,3,'earn_points',12,NULL,'Earned 12 points for booking #3','2026-05-22 11:32:19'),(18,63,4,'earn_points',8,NULL,'Earned 8 points for booking #4','2026-05-22 11:32:19'),(19,63,5,'earn_points',4,NULL,'Earned 4 points for booking #5','2026-05-22 11:32:19'),(20,12,6,'earn_points',4,NULL,'Earned 4 points for booking #6','2026-05-22 11:32:19'),(21,12,22,'earn_points',3,NULL,'Earned 3 points for booking #22','2026-05-22 11:32:19'),(22,12,8,'earn_points',4,NULL,'Earned 4 points for booking #8','2026-05-22 11:32:19'),(23,12,9,'earn_points',4,NULL,'Earned 4 points for booking #9','2026-05-22 11:32:19'),(24,12,23,'earn_points',6,NULL,'Earned 6 points for booking #23','2026-05-22 11:32:19'),(25,12,24,'earn_points',6,NULL,'Earned 6 points for booking #24','2026-05-22 11:32:19'),(26,12,25,'earn_points',9,NULL,'Earned 9 points for booking #25','2026-05-22 11:32:19'),(27,12,26,'earn_points',9,NULL,'Earned 9 points for booking #26','2026-05-22 11:32:19'),(28,12,27,'earn_points',8,NULL,'Earned 8 points for booking #27','2026-05-22 11:32:19'),(29,8,28,'earn_points',12,NULL,'Earned 12 points for booking #28','2026-05-22 11:32:19'),(30,65,29,'earn_points',3,NULL,'Earned 3 points for booking #29','2026-05-22 11:32:19'),(31,65,30,'earn_points',3,NULL,'Earned 3 points for booking #30','2026-05-22 11:32:19'),(32,66,31,'earn_points',3,NULL,'Earned 3 points for booking #31','2026-05-22 11:32:19'),(33,66,32,'earn_points',3,NULL,'Earned 3 points for booking #32','2026-05-22 11:32:19'),(34,66,33,'earn_points',12,NULL,'Earned 12 points for booking #33','2026-05-22 11:32:19'),(35,2,34,'earn_points',3,NULL,'Earned 3 points for booking #34','2026-05-22 11:32:19'),(36,8,35,'earn_points',3,NULL,'Earned 3 points for booking #35','2026-05-22 11:32:19'),(37,8,37,'earn_points',25,NULL,'Earned 25 points for booking #37','2026-05-22 11:32:19'),(38,12,39,'earn_points',12,NULL,'Earned 12 points for booking #39','2026-05-22 11:32:19'),(39,12,40,'earn_points',5,NULL,'Earned 5 points for booking #40','2026-05-22 11:32:19'),(40,2,42,'earn_points',3,NULL,'Earned 3 points for booking #42','2026-05-22 11:32:19'),(41,68,45,'earn_points',5,NULL,'Earned 5 points for booking #45','2026-05-22 11:32:19'),(46,2,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #47','2026-05-22 11:56:21'),(47,8,NULL,'redeem_points',-50,NULL,'Redeemed S$5 Beauty Voucher (S$5 off)','2026-05-23 12:50:18'),(48,57,NULL,'redeem_points',-50,NULL,'Redeemed S$5 Beauty Voucher (S$5 off)','2026-05-23 14:33:29'),(49,57,NULL,'redeem_points',-50,NULL,'Redeemed S$5 Beauty Voucher (S$5 off)','2026-05-23 14:33:53'),(50,66,87,'earn_points',9,NULL,'Earned 9 points for booking #87','2026-05-24 13:30:19'),(51,122,88,'earn_points',3,NULL,'Earned 3 points for booking #88','2026-05-24 14:14:48'),(52,122,89,'earn_points',3,NULL,'Earned 3 points for booking #89','2026-05-24 14:21:30'),(53,57,NULL,'redeem_points',-25,NULL,'Redeemed 10% off next booking! (10% off)','2026-05-25 07:57:59'),(54,57,NULL,'redeem_points',-25,NULL,'Redeemed 10% off next booking! (10% off)','2026-05-25 08:09:51'),(55,2,93,'earn_points',2,NULL,'Earned 2 points for booking #93','2026-05-25 08:37:12'),(56,2,94,'earn_points',2,NULL,'Earned 2 points for booking #94','2026-05-25 08:37:12'),(57,2,95,'earn_points',2,NULL,'Earned 2 points for booking #95','2026-05-25 08:37:12'),(58,57,83,'earn_points',1,NULL,'Earned 1 points for booking #83','2026-05-25 08:38:52'),(59,57,91,'earn_points',1,NULL,'Earned 1 points for booking #91','2026-05-25 08:38:52'),(60,57,92,'earn_points',1,NULL,'Earned 1 points for booking #92','2026-05-25 08:38:52'),(61,8,82,'earn_points',6,NULL,'Earned 6 points for booking #82','2026-05-25 16:38:36'),(62,98,84,'earn_points',3,NULL,'Earned 3 points for booking #84','2026-05-25 16:39:29'),(63,98,86,'earn_points',5,NULL,'Earned 5 points for booking #86','2026-05-25 16:39:29'),(64,98,90,'earn_points',6,NULL,'Earned 6 points for booking #90','2026-05-25 16:39:29'),(65,12,96,'earn_points',3,NULL,'Earned 3 points for booking #96','2026-05-26 05:53:28'),(66,12,80,'earn_points',9,NULL,'Earned 9 points for booking #80','2026-05-26 05:55:49'),(67,12,100,'earn_points',7,NULL,'Earned 7 points for booking #100','2026-05-26 17:58:15'),(68,2,101,'earn_points',3,NULL,'Earned 3 points for booking #101','2026-05-27 06:59:25'),(69,2,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #101','2026-05-27 07:36:57'),(70,2,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #95','2026-05-27 07:51:56'),(71,57,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #92','2026-05-27 07:58:12'),(72,57,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #83','2026-05-27 08:07:35'),(73,12,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #39','2026-05-27 08:26:23'),(74,12,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #3','2026-05-27 08:28:40'),(75,12,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #13','2026-05-27 08:31:07'),(76,12,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #100','2026-05-27 08:32:45'),(77,12,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #9','2026-05-27 08:35:09'),(78,12,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #2','2026-05-27 08:37:56'),(79,12,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #26','2026-05-27 08:38:54'),(80,12,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #21','2026-05-27 08:41:02'),(81,12,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #17','2026-05-27 08:42:37'),(82,12,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #25','2026-05-27 08:47:34'),(83,57,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #91','2026-05-27 08:55:12'),(84,2,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #34','2026-05-27 09:05:02'),(85,122,102,'earn_points',4,NULL,'Earned 4 points for booking #102','2026-05-28 02:33:48'),(86,98,103,'earn_points',10,NULL,'Earned 10 points for booking #103','2026-05-28 04:04:19'),(87,98,104,'earn_points',3,NULL,'Earned 3 points for booking #104','2026-05-28 04:14:33'),(88,2,NULL,'earn_points',2,NULL,'Earned 2 points for reviewing booking #75','2026-05-28 06:30:42'),(89,98,107,'earn_points',3,NULL,'Earned 3 points for booking #107','2026-06-04 04:20:27'),(90,99,109,'earn_points',12,NULL,'Earned 12 points for booking #109','2026-06-09 18:00:21'),(91,99,110,'earn_points',6,NULL,'Earned 6 points for booking #110','2026-06-09 18:03:23'),(92,99,111,'earn_points',6,NULL,'Earned 6 points for booking #111','2026-06-09 18:14:13'),(93,99,112,'earn_points',4,NULL,'Earned 4 points for booking #112','2026-06-09 18:32:37'),(94,99,113,'earn_points',2,NULL,'Earned 2 points for booking #113','2026-06-09 18:44:24'),(95,99,114,'earn_points',5,NULL,'Earned 5 points for booking #114','2026-06-10 15:57:13');
/*!40000 ALTER TABLE `loyalty_transaction` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:57
