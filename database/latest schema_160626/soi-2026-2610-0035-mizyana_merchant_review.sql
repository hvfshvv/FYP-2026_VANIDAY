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
-- Table structure for table `merchant_review`
--

DROP TABLE IF EXISTS `merchant_review`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merchant_review` (
  `review_id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `merchant_id` int NOT NULL,
  `service_id` int NOT NULL,
  `staff_id` int DEFAULT NULL,
  `rating` int NOT NULL,
  `review_text` text COLLATE utf8mb4_unicode_ci,
  `merchant_reply` text COLLATE utf8mb4_unicode_ci,
  `merchant_replied_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`review_id`),
  UNIQUE KEY `booking_id` (`booking_id`),
  KEY `merchant_id` (`merchant_id`),
  KEY `service_id` (`service_id`),
  KEY `staff_id` (`staff_id`),
  KEY `merchant_review_ibfk_2_idx` (`customer_id`),
  CONSTRAINT `merchant_review_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `booking` (`booking_id`),
  CONSTRAINT `merchant_review_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `customer` (`customer_id`),
  CONSTRAINT `merchant_review_ibfk_3` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`merchant_id`),
  CONSTRAINT `merchant_review_ibfk_4` FOREIGN KEY (`service_id`) REFERENCES `service` (`service_id`),
  CONSTRAINT `merchant_review_ibfk_5` FOREIGN KEY (`staff_id`) REFERENCES `staff` (`staff_id`),
  CONSTRAINT `merchant_review_chk_1` CHECK ((`rating` between 1 and 5))
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `merchant_review`
--

LOCK TABLES `merchant_review` WRITE;
/*!40000 ALTER TABLE `merchant_review` DISABLE KEYS */;
INSERT INTO `merchant_review` VALUES (1,42,18,9,40,NULL,5,'The staff were very friendly and professional. The haircut turned out exactly how I wanted, and the wash was relaxing! The salon was clean and the service was fast and smooth.','Thank you so much for your kind review, Lilly! We’re happy to hear that you enjoyed your haircut and wash experience with us. Our team truly appreciates your support, and we look forward to welcoming you back again soon!','2026-05-22 10:36:47','2026-05-22 10:33:33'),(2,47,18,4,14,NULL,5,'I had a great experience at Hair Republic. The hairstylist was attentive and gave helpful suggestions on the haircut style that suited me. The blow dry service made my hair look smooth and volumized, and the overall service felt very professional. The salon atmosphere was comfortable and welcoming.','Thank you for your lovely review! We’re delighted to hear that you enjoyed your haircut and blow dry experience at Hair Republic. Our team always strives to provide professional service and a relaxing atmosphere for every customer. We truly appreciate your support and look forward to seeing you again soon!','2026-05-22 12:08:22','2026-05-22 11:56:21'),(3,101,18,1,1,6,5,'The hairstylist was friendly and listened carefully to the hairstyle I wanted. The haircut was neat and professionally done, and the whole experience felt relaxing. The salon environment was clean and comfortable as well.',NULL,NULL,'2026-05-27 07:36:57'),(4,95,18,7,33,11,5,'The lash removal process was gentle and comfortable. The staff explained each step clearly and removed my extensions carefully without damaging my natural lashes. I\'m very happy with the service and professionalism! :)','Thank you for your lovely review, Lilly! We’re delighted to hear that the removal process was gentle and professional for you. Our team always aims to provide a safe and comfortable experience, and we truly appreciate your support ?','2026-05-27 09:18:26','2026-05-27 07:51:56'),(5,92,33,7,33,11,5,'I had a pleasant experience at the salon. The lash technician was patient and made sure the removal process was painless. The environment was clean and relaxing, and my natural lashes felt healthy afterwards.','Thank you for sharing your experience, Sabrina! We’re happy to know that you felt comfortable and well taken care of during your Lash Removal session. We appreciate your kind words and hope to see you again soon ?','2026-05-27 09:18:04','2026-05-27 07:58:12'),(6,83,33,7,33,11,5,'This is my third visiting the salon and they never disappoint. The lash removal process was very gentle and comfortable, and the staff were friendly as always. It\'s definitely one of my favourite salons and I would highly recommend it to others.','Thank you for your continued support, Sabrina! We’re so glad to hear that your experiences with us have been consistently enjoyable. Your recommendation truly means a lot to our team, and we look forward to welcoming you back for your next visit ✨','2026-05-27 09:17:34','2026-05-27 08:07:35'),(7,39,13,9,39,NULL,5,'I absolutely loved the hair colouring results. The stylist recommended a shade that suited me perfectly and the colour turned out even better than expected. This is my second time visiting and I’ll definitely come back again.',NULL,NULL,'2026-05-27 08:26:23'),(8,3,13,4,15,NULL,5,'The staff were professional and attentive throughout the session. My hair colour looks vibrant and healthy, and the salon atmosphere was very comfortable. Highly recommend this salon for colouring services.',NULL,NULL,'2026-05-27 08:28:40'),(9,13,13,5,23,NULL,5,'The facial was relaxing and my skin felt hydrated and refreshed afterward. The beautician was gentle and professional throughout the session. I’ll definitely return for future treatments.',NULL,NULL,'2026-05-27 08:31:07'),(10,100,13,8,34,12,5,'I booked this service for an event and the makeup turned out beautiful. The makeup artist was skilled and listened to the look I wanted. I received so many compliments throughout the day.',NULL,NULL,'2026-05-27 08:32:45'),(11,9,13,2,5,NULL,4,'The gel pedicure was done neatly and the colours available were beautiful. The staff paid attention to detail and made the experience very relaxing. This is my third visit already.”',NULL,NULL,'2026-05-27 08:35:09'),(12,2,13,4,17,NULL,5,'The keratin treatment made my hair feel so soft and manageable. The staff explained the aftercare clearly and the results were worth it. I’m very satisfied with the experience',NULL,NULL,'2026-05-27 08:37:56'),(13,26,13,5,21,NULL,4,'The therapist was knowledgeable and explained each step of the chemical peel process carefully. My skin already feels smoother and brighter after the treatment. The clinic was clean and professional.',NULL,NULL,'2026-05-27 08:38:54'),(14,21,13,6,25,NULL,5,'The instructor was patient and encouraging throughout the class. The session was enjoyable and beginner-friendly while still being challenging enough. I felt very comfortable joining as a first timer.',NULL,NULL,'2026-05-27 08:41:02'),(15,17,13,5,22,NULL,5,'I’ve been coming here regularly for acne treatments and I can really see improvements in my skin. The therapist was professional and explained the treatment process clearly. Highly recommended for anyone struggling with acne',NULL,NULL,'2026-05-27 08:42:37'),(16,25,13,7,30,NULL,5,'I’m obsessed with how my lashes turned out. The lash technician was gentle and made sure the style suited my eye shape perfectly. This is definitely my favourite place for lash services.','Thank you so much for your kind review, Mary! We’re happy to hear that you loved your Volume Lash Set and had a comfortable experience with our lash technician. Your support means a lot to us and we can’t wait to see you again soon ?','2026-05-27 09:17:08','2026-05-27 08:47:34'),(17,91,33,7,33,11,5,'Excellent service as always!','Thank you for your 5-star rating, Sabrina! We’re glad you enjoyed your Lash Removal service, and we look forward to welcoming you back again soon ✨','2026-05-27 09:24:55','2026-05-27 08:55:12'),(18,34,18,9,40,NULL,5,'The haircut and wash were excellent!',NULL,NULL,'2026-05-27 09:05:02'),(19,75,18,7,33,11,4,'Painless',NULL,NULL,'2026-05-28 06:30:42');
/*!40000 ALTER TABLE `merchant_review` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:55
