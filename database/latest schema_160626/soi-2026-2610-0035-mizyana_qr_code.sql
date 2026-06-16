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
-- Table structure for table `qr_code`
--

DROP TABLE IF EXISTS `qr_code`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qr_code` (
  `qr_id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `qr_token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qr_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qr_image_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qr_type` enum('booking','check_in','general') COLLATE utf8mb4_unicode_ci DEFAULT 'booking',
  `is_active` tinyint(1) DEFAULT '1',
  `generated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`qr_id`),
  UNIQUE KEY `qr_token` (`qr_token`),
  UNIQUE KEY `uq_qr_code_url` (`qr_url`),
  KEY `idx_qr_code_merchant_type_active` (`merchant_id`,`qr_type`,`is_active`),
  CONSTRAINT `qr_code_ibfk_1` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`merchant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `qr_code`
--

LOCK TABLES `qr_code` WRITE;
/*!40000 ALTER TABLE `qr_code` DISABLE KEYS */;
INSERT INTO `qr_code` VALUES (1,9,'ZR-Gzg8Vuka9ujer-wLond9FVGD2ccvPSs2OXlEhTz8','http://localhost:3000/book/ZR-Gzg8Vuka9ujer-wLond9FVGD2ccvPSs2OXlEhTz8','/images/qr/9-ZR-Gzg8Vuka9ujer-wLond9FVGD2ccvPSs2OXlEhTz8.png','booking',0,'2026-05-18 07:33:45'),(2,11,'oPi0_jGSId1IS9fz2XEpORH50Gk4Aj5yHC-x6Sg3AyQ','http://localhost:3000/book/oPi0_jGSId1IS9fz2XEpORH50Gk4Aj5yHC-x6Sg3AyQ','/images/qr/11-oPi0_jGSId1IS9fz2XEpORH50Gk4Aj5yHC-x6Sg3AyQ.png','booking',1,'2026-05-18 07:50:38'),(3,9,'yfi7aUsOYJGkjK9KYKN9s939Wk7mrrcfw9k5P3kq1-A','http://localhost:3000/book/arrival/yfi7aUsOYJGkjK9KYKN9s939Wk7mrrcfw9k5P3kq1-A','/images/qr/9-check_in-yfi7aUsOYJGkjK9KYKN9s939Wk7mrrcfw9k5P3kq1-A.png','check_in',0,'2026-05-18 08:16:26'),(4,4,'RBBmh--8MAngR5bdGdTImqmi8Q9cRDLQNKx2Rcou7nE','http://localhost:3000/book/RBBmh--8MAngR5bdGdTImqmi8Q9cRDLQNKx2Rcou7nE','/images/qr/4-booking-RBBmh--8MAngR5bdGdTImqmi8Q9cRDLQNKx2Rcou7nE.png','booking',0,'2026-05-18 08:23:03'),(5,4,'_zaiQgIuXNPZKSVeM-HmSoDpTuPaIezDGEFCOu-gqUI','http://localhost:3000/book/arrival/_zaiQgIuXNPZKSVeM-HmSoDpTuPaIezDGEFCOu-gqUI','/images/qr/4-check_in-_zaiQgIuXNPZKSVeM-HmSoDpTuPaIezDGEFCOu-gqUI.png','check_in',0,'2026-05-18 08:23:03'),(6,9,'pDcVBmY5lFMdLEI_UXK5RErAX75ZAMCUeJ_nS5uG2gM','http://localhost:3000/book/pDcVBmY5lFMdLEI_UXK5RErAX75ZAMCUeJ_nS5uG2gM','/images/qr/9-booking-pDcVBmY5lFMdLEI_UXK5RErAX75ZAMCUeJ_nS5uG2gM.png','booking',0,'2026-05-19 06:21:42'),(7,9,'WYK0F3_9gZXnO-eu11duAPcQf2sp1rnlNbcJroneKGE','http://localhost:3000/book/arrival/WYK0F3_9gZXnO-eu11duAPcQf2sp1rnlNbcJroneKGE','/images/qr/9-check_in-WYK0F3_9gZXnO-eu11duAPcQf2sp1rnlNbcJroneKGE.png','check_in',0,'2026-05-19 06:21:48'),(8,16,'HXd-orWiiLBW4ZbckxV-rjcVziztHLCEQOcmUN3WAFY','http://localhost:3000/book/arrival/HXd-orWiiLBW4ZbckxV-rjcVziztHLCEQOcmUN3WAFY','/images/qr/16-check_in-HXd-orWiiLBW4ZbckxV-rjcVziztHLCEQOcmUN3WAFY.png','check_in',1,'2026-05-19 16:05:33'),(9,16,'Uy_do5v3W7VpfzkfIv4yT0YDDCcvY1m06Z2tNrvIRSk','http://localhost:3000/book/Uy_do5v3W7VpfzkfIv4yT0YDDCcvY1m06Z2tNrvIRSk','/images/qr/16-booking-Uy_do5v3W7VpfzkfIv4yT0YDDCcvY1m06Z2tNrvIRSk.png','booking',1,'2026-05-19 16:05:33'),(10,4,'9PZHkCVcgv6T73f3lHxQOPWsTOMJY_0mlKVZwYLxB4Q','http://localhost:3000/book/9PZHkCVcgv6T73f3lHxQOPWsTOMJY_0mlKVZwYLxB4Q','/images/qr/4-booking-9PZHkCVcgv6T73f3lHxQOPWsTOMJY_0mlKVZwYLxB4Q.png','booking',0,'2026-05-26 15:33:35'),(11,4,'X0zCHWWlpyXadvQVgESCsAQYYzs7QqiCY7TsVHz4Wt0','http://localhost:3000/book/arrival/X0zCHWWlpyXadvQVgESCsAQYYzs7QqiCY7TsVHz4Wt0','/images/qr/4-check_in-X0zCHWWlpyXadvQVgESCsAQYYzs7QqiCY7TsVHz4Wt0.png','check_in',0,'2026-05-26 15:33:39'),(12,1,'rKyEG8xycqJQxRPWfNYJyCgrN_LvJ4eS9a38aNyAaGc','http://localhost:3000/book/arrival/rKyEG8xycqJQxRPWfNYJyCgrN_LvJ4eS9a38aNyAaGc','/images/qr/1-check_in-rKyEG8xycqJQxRPWfNYJyCgrN_LvJ4eS9a38aNyAaGc.png','check_in',1,'2026-05-27 07:24:29'),(13,1,'VZu_6QYbhRrYnohL_loGnfl_ECX2AzQnUXJd34TepMs','http://localhost:3000/book/VZu_6QYbhRrYnohL_loGnfl_ECX2AzQnUXJd34TepMs','/images/qr/1-booking-VZu_6QYbhRrYnohL_loGnfl_ECX2AzQnUXJd34TepMs.png','booking',1,'2026-05-27 07:24:29'),(14,9,'aZE7fQuUYQtWWkckwMQAxDbfKxQqif6KG5U5dFsq-Q8','http://localhost:3002/book/aZE7fQuUYQtWWkckwMQAxDbfKxQqif6KG5U5dFsq-Q8','/images/qr/9-booking-aZE7fQuUYQtWWkckwMQAxDbfKxQqif6KG5U5dFsq-Q8.png','booking',1,'2026-05-28 04:54:19'),(15,9,'iJvO0YgjgNKr_Z2xweWipvvM6TomwtuXiHcejumCY-M','http://localhost:3002/book/arrival/iJvO0YgjgNKr_Z2xweWipvvM6TomwtuXiHcejumCY-M','/images/qr/9-check_in-iJvO0YgjgNKr_Z2xweWipvvM6TomwtuXiHcejumCY-M.png','check_in',1,'2026-05-28 04:54:21'),(16,4,'Yl8hT0t_TN6k0zQdgTWjy0ebsnmpdngGoSt_3fc_1bQ','http://localhost:3000/book/Yl8hT0t_TN6k0zQdgTWjy0ebsnmpdngGoSt_3fc_1bQ','/images/qr/4-booking-Yl8hT0t_TN6k0zQdgTWjy0ebsnmpdngGoSt_3fc_1bQ.png','booking',1,'2026-05-28 06:26:11'),(17,4,'CmSKEvfHtq1nfcoJ_RITOxjF5fMHFI_NGM__3KwIlho','http://localhost:3000/book/arrival/CmSKEvfHtq1nfcoJ_RITOxjF5fMHFI_NGM__3KwIlho','/images/qr/4-check_in-CmSKEvfHtq1nfcoJ_RITOxjF5fMHFI_NGM__3KwIlho.png','check_in',1,'2026-05-28 06:26:22'),(18,7,'SVuVqQ6XLA_ZSeagHhZ7F8hh3nilJNrdeJe8DnllazU','http://localhost:3000/book/arrival/SVuVqQ6XLA_ZSeagHhZ7F8hh3nilJNrdeJe8DnllazU','/images/qr/7-check_in-SVuVqQ6XLA_ZSeagHhZ7F8hh3nilJNrdeJe8DnllazU.png','check_in',1,'2026-06-13 16:04:48'),(19,7,'Melj_Y46vqcL_x0AbbQOUsbnZ86f4Y3ruYRRNyyIkKM','http://localhost:3000/book/Melj_Y46vqcL_x0AbbQOUsbnZ86f4Y3ruYRRNyyIkKM','/images/qr/7-booking-Melj_Y46vqcL_x0AbbQOUsbnZ86f4Y3ruYRRNyyIkKM.png','booking',1,'2026-06-13 16:04:48');
/*!40000 ALTER TABLE `qr_code` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:28:05
