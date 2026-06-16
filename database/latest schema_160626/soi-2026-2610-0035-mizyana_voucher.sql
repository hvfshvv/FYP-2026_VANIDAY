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
-- Table structure for table `voucher`
--

DROP TABLE IF EXISTS `voucher`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `voucher` (
  `voucher_id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int DEFAULT NULL,
  `voucher_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `voucher_type` enum('merchant','platform') COLLATE utf8mb4_unicode_ci NOT NULL,
  `campaign_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `discount_type` enum('percent','fixed_amount') COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_value` decimal(10,2) NOT NULL,
  `min_spend` decimal(10,2) DEFAULT NULL,
  `usage_limit` int DEFAULT NULL,
  `usage_per_customer` int DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`voucher_id`),
  UNIQUE KEY `voucher_code` (`voucher_code`),
  KEY `merchant_id` (`merchant_id`),
  CONSTRAINT `voucher_ibfk_1` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`merchant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `voucher`
--

LOCK TABLES `voucher` WRITE;
/*!40000 ALTER TABLE `voucher` DISABLE KEYS */;
INSERT INTO `voucher` VALUES (1,NULL,'WELCOME10','platform','Uniday Welcome Treat','percent',10.00,30.00,200,1,'2026-05-17','2026-06-30',1),(2,NULL,'BEAUTY15','platform','Beauty Week Saver','percent',15.00,50.00,150,1,'2026-05-17','2026-07-17',1),(3,NULL,'WELLNESS8','platform','Wellness Weekend Deal','fixed_amount',8.00,40.00,120,1,'2026-05-17','2026-08-31',1),(4,NULL,'STUDENT12','platform','Student Glow Up','percent',12.00,35.00,180,1,'2026-05-16','2026-05-16',1),(5,NULL,'PAYDAY6','platform','Payday Beauty Bonus','fixed_amount',6.00,45.00,100,1,'2026-05-25','2026-06-10',1),(6,NULL,'WEEK299','platform','Special  1 WEEK promo','percent',2.99,10.00,1,1,'2026-05-21','2026-05-31',1),(7,NULL,'LOYALTY_BRONZE5_33_MPIG7UUJO8OE2','platform','S$5 Beauty Voucher','fixed_amount',5.00,NULL,1,1,'2026-05-23','2026-08-23',1),(8,NULL,'LOYALTY_BRONZE5_33_MPIG8DBWYSU2F','platform','S$5 Beauty Voucher','fixed_amount',5.00,NULL,1,1,'2026-05-23','2026-08-23',1),(9,NULL,'LOYALTY_6_33_MPKWZ3U7RRMV4','platform','10% off next booking!','percent',10.00,25.00,1,1,'2026-05-25','2026-08-25',1),(10,NULL,'LOYALTY_6_33_MPKXED6O9TEVQ','platform','10% off next booking!','percent',10.00,25.00,1,1,'2026-05-25','2026-08-25',1);
/*!40000 ALTER TABLE `voucher` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:35
