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
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `booking_id` int DEFAULT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `notification_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'general',
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_read` (`user_id`,`is_read`,`created_at`),
  KEY `idx_notifications_booking` (`booking_id`),
  CONSTRAINT `fk_notifications_booking` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,30,112,'Booking created','Your Manicure booking at Glam Studio has been created for 12 Jun 2026 at 18:00.','booking_created',1,'2026-06-09 18:32:29'),(2,2,112,'New booking received','kaa created a Manicure booking for 12 Jun 2026 at 18:00.','booking_created',0,'2026-06-09 18:32:29'),(3,30,113,'Uniday Assistant','I created your Lash Removal booking at Pretty Lash Studio for 11 Jun 2026 at 10:00. You can continue to payment from your bookings page.','booking_created',0,'2026-06-09 18:44:12'),(4,8,113,'Uniday Assistant','kaa just created a Lash Removal booking for 11 Jun 2026 at 10:00.','booking_created',0,'2026-06-09 18:44:12'),(5,30,113,'Uniday Assistant','I have cancelled your Lash Removal booking at Pretty Lash Studio.','booking_cancelled',0,'2026-06-09 18:48:57'),(6,8,113,'Uniday Assistant','kaa cancelled a Lash Removal booking.','booking_cancelled',0,'2026-06-09 18:48:57'),(7,30,110,'Uniday Assistant','I rescheduled your Chemical Peel booking from 12 Jun 2026 at 10:00 to 24 Jun 2026 at 10:00.','booking_rescheduled',0,'2026-06-09 18:53:22'),(8,6,110,'Uniday Assistant','kaa moved a Chemical Peel booking from 12 Jun 2026 at 10:00 to 24 Jun 2026 at 10:00.','booking_rescheduled',0,'2026-06-09 18:53:22'),(9,30,NULL,'You','cancel my booking','assistant_question',1,'2026-06-09 18:59:47'),(10,30,NULL,'Uniday Assistant','Hi kaa, you can cancel an eligible booking from My Bookings. Open View bookings, choose the booking, then select Cancel. If the merchant has a cancellation policy, the app will check it before cancelling.','assistant_answer',0,'2026-06-09 18:59:47'),(11,30,NULL,'You','where can i view my bookings','assistant_question',1,'2026-06-09 19:00:24'),(12,30,NULL,'Uniday Assistant','Hi kaa, you can view all your appointments from View bookings. I will also message you here when bookings are created, confirmed, cancelled, or rescheduled.','assistant_answer',0,'2026-06-09 19:00:24'),(13,30,114,'Uniday Assistant','I created your Scalp Treatment booking at Hair Republic for 3 Jul 2026 at 09:00. You can continue to payment from your bookings page.','booking_created',1,'2026-06-10 15:56:33'),(14,5,114,'Uniday Assistant','kaa just created a Scalp Treatment booking for 3 Jul 2026 at 09:00.','booking_created',1,'2026-06-10 15:56:33'),(15,30,114,'Uniday Assistant','Payment received. Your Scalp Treatment booking at Hair Republic is confirmed for 3 Jul 2026 at 09:00. See you there.','booking_confirmed',0,'2026-06-10 15:57:12'),(16,5,114,'Uniday Assistant','Payment received for kaa\'s Scalp Treatment booking on 3 Jul 2026 at 09:00.','booking_confirmed',0,'2026-06-10 15:57:13');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:37
