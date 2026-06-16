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
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('customer','merchant','admin') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','suspended') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `email_verified_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=36 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (2,'Glam Studio','glam@vaniday.com','91234567','$2a$10$fe1znMSMn4ZDSHMyqGuc/eV0z8AFhlSf9pA6YiAYy5wcwvVTaxbu6','merchant','active','2026-05-10 13:56:02','2026-05-10 13:56:02'),(3,'Luxe Nail Bar','luxenail@uniday.com','62345678','$2a$10$fe1znMSMn4ZDSHMyqGuc/eV0z8AFhlSf9pA6YiAYy5wcwvVTaxbu6','merchant','active','2026-05-12 14:07:58','2026-05-12 14:07:58'),(4,'The Spa Sanctuary','spa@uniday.com','63456789','$2a$10$fe1znMSMn4ZDSHMyqGuc/eV0z8AFhlSf9pA6YiAYy5wcwvVTaxbu6','merchant','active','2026-05-12 14:11:54','2026-05-12 14:11:54'),(5,'Hair Republic','hairrepublic@uniday.com','64567890','$2a$10$fe1znMSMn4ZDSHMyqGuc/eV0z8AFhlSf9pA6YiAYy5wcwvVTaxbu6','merchant','active','2026-05-12 14:11:54','2026-05-12 14:11:54'),(6,'Glow Skin Clinic','glow@uniday.com','65678901','$2a$10$fe1znMSMn4ZDSHMyqGuc/eV0z8AFhlSf9pA6YiAYy5wcwvVTaxbu6','merchant','active','2026-05-12 14:11:55','2026-05-12 14:11:55'),(7,'Zen Wellness Studio','zen@uniday.com','66789012','$2a$10$fe1znMSMn4ZDSHMyqGuc/eV0z8AFhlSf9pA6YiAYy5wcwvVTaxbu6','merchant','active','2026-05-12 14:11:55','2026-05-12 14:11:55'),(8,'Pretty Lash Studio','prettylash@uniday.com','67890123','$2a$10$fe1znMSMn4ZDSHMyqGuc/eV0z8AFhlSf9pA6YiAYy5wcwvVTaxbu6','merchant','active','2026-05-12 14:11:55','2026-05-12 14:11:55'),(9,'Goddess Beauty Bar','goddess@uniday.com','68901234','$2a$10$fe1znMSMn4ZDSHMyqGuc/eV0z8AFhlSf9pA6YiAYy5wcwvVTaxbu6','merchant','active','2026-05-12 14:11:55','2026-05-12 14:11:55'),(10,'John Doe','johndoe@mail.com','91231234','$2a$10$Fq000MVGGLGfz0MJrhnY/OvXV34WlPLjkuO0kN8wYuRdXxHbyy4ni','customer','suspended','2026-05-12 15:11:16','2026-05-12 15:11:16'),(11,'Mary Tan','mary@gmail.com','98765432','$2a$10$LHptc0R0TVQmZIbitVy46OMPdAtaVEUDNkF79oRDVL2WEoxUzG7oG','customer','active','2026-05-13 04:24:17','2026-05-13 04:24:17'),(12,'ka','ka@gmail.com','17263527','$2a$10$ckkKP75JU0ZLwuAHbVB0q.gFneOni2A/Tdo9oDI35TZ7Bo5Hvasiq','customer','active','2026-05-13 07:59:07','2026-05-13 07:59:07'),(13,'mary tan','mary@mary.com','+6587654321','$2a$10$0tcMuAuPcqH/10WcwAWc7OVXVfKEFz3iJ8pziaLjdlPB8Eu9sLyfO','customer','active','2026-05-13 09:48:49','2026-05-13 09:48:49'),(14,'Bob Lee','crowncomb@uniday.com','87873232','$2a$10$fe1znMSMn4ZDSHMyqGuc/eV0z8AFhlSf9pA6YiAYy5wcwvVTaxbu6','merchant','active','2026-05-14 04:34:30','2026-05-14 04:34:30'),(15,'Uniday Admin','admin@uniday.com','60000000','$2a$10$.1RAPFWwtFf/XCvPWk1qjOOIDXdZ0uFm4t3FbMi4KLMkxpzfCUSWO','admin','active','2026-05-14 04:53:10','2026-05-14 04:53:10'),(16,'Diane Low','diane@diane.com','99998888','$2a$10$uXwkXjUrTEQ80TxaGD.dZOv3OZIDWG6qH3iA0WytBe9g8k4nU1HzS','customer','active','2026-05-14 09:38:25','2026-05-14 09:38:25'),(17,'May tan','may@may.com','912345678','$2a$10$fi3BzvT8CqkefjjZKEfgNe1olcJDIAWrjE33LqPtXEHg.SYrKnbAy','customer','active','2026-05-14 09:48:20','2026-05-14 09:48:20'),(18,'Lilly Lim','lilly@lilly.com','91231234','$2a$10$xjxzbdEcZ/..vftLBJ766O5OG6ZOFaLctULgVk3ZXh5n8NNmO0sfG','customer','active','2026-05-16 09:58:09','2026-05-16 09:58:09'),(19,'Danny','dewyglow@uniday.com','87878787','$2a$10$2GDGjLOFXI8O7ifyB6hgg.lD5wPVdrQmfjnGlIJMhBKT9HrJO0M.y','merchant','active','2026-05-16 15:16:05','2026-05-16 15:16:05'),(20,'Nur Aina Rahman','velvetbloom@uniday.com','91234567','$2a$10$/bVorMPR2K.zWmfDFp5mMO99XHEh5wEIp3p7gIqWp1ezMH.InD7lK','merchant','active','2026-05-16 19:24:00','2026-05-16 19:24:00'),(21,'Nadiah Tan','lushaura@uniday.com','98765432','$2a$10$9S9lfugnEk1OYsoo4EEkYONIf.aODoki6Oht8ugIOVIaUGGwQ4HJa','merchant','active','2026-05-16 19:31:32','2026-05-16 19:31:32'),(22,'Nadia Rahman','lunabeauty@uniday.com','91237846','$2a$10$yxuJ67VPS5gQom7WQnSNxeAue07twkkGG3DABIVYLklBVIaKIjShq','merchant','active','2026-05-18 04:22:35','2026-05-18 04:22:35'),(23,'Alicia Tan','musehair@uniday.com','96725410','$2a$10$el/I1uUpYzhvySv74cDJne4hAQ.SiJcdQ2.QocOYo3I9AQvgDhyLa','merchant','active','2026-05-18 05:15:34','2026-05-18 05:15:34'),(24,'Tom Lom','karislim2424@gmail.com','4444444444','$2a$10$tjzH4l8DV44Qw3KDP0qX.uE/sye7CVKCoZbU7qexSWfXJehhQitWa','merchant','active','2026-05-18 08:04:13','2026-05-18 08:04:13'),(25,'WhatsApp Customer 6589483241','whatsapp_6589483241@uniday.local',NULL,'$2a$10$HVXQLIu.Z/WXT4Zq/RfvuO2qICfmc1MX.prUFrLKJVeh0ELdsPrm.','customer','suspended','2026-05-18 09:10:47','2026-05-18 09:10:47'),(26,'Aisyah','aisyah@aisyah.com','+6589483241','$2a$10$.eFK.2F33xAPbgO/YJAGQO2O7o2I4wTln.kNDVPSy/WEr33JSurGK','customer','active','2026-05-18 09:20:50','2026-05-18 09:20:50'),(27,'Fathima','fathima123@gmail.com','+6588880000','$2a$08$vaZy5hQ120CE9v4PbRGujeEAQgvRUDNWpMN9fb3JFroWdscpDoqQG','customer','active','2026-05-18 13:35:46','2026-05-18 13:35:46'),(28,'mimi tan','mimi@mimi.com','+6598760001','$2a$10$08wvByc5AGdF3dKd4xySxudrC4TRempCFuUSqO1.7FpSbFdQRTu.6','customer','active','2026-05-18 14:59:29','2026-05-18 14:59:29'),(29,'Minnie Mavis','minnie@uniday.com','99123456','$2a$10$TAfBetAmilSDYiFmp3ljROcGjFqzWXPMtYPvGsOvO7X74yapKdYVi','merchant','active','2026-05-19 16:05:33','2026-05-19 16:05:33'),(30,'kaa','24048983@myrp.edu.sg','4444444444444','$2a$10$U0utsJ6u3xRsliCTGsmmc.hft4hWEtoEmqSOQ5oXrsUJs5jX/eN3S','customer','active','2026-05-21 04:23:03','2026-05-21 04:23:03'),(33,'sabrina','sabrina@sabrina.com','98796789','$2a$10$0BQx57irVPgAjMkjH2.vMu8.S09W./vv8R.mGvkr3mTQR7OvIbgLu','customer','active','2026-05-22 09:38:30','2026-05-22 09:38:30'),(34,'karis ','019cuteunicorn@gmail.com','4444444444444','$2a$10$wSaCl/SLmmD6OtQftIL8ievkUdcHKcPX1ai1owEp4UBTOFn7bgyWG','customer','active','2026-05-24 14:11:49','2026-05-24 14:02:40'),(35,'test email','kk@gmail.com','+6585043408','$2a$10$P8XkdaNaXwOcsy.pxp0zoOpeInyhVgKCH90qZl8Fd6bCdFNHSCEHS','customer','active',NULL,'2026-05-25 08:12:53');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:27:31
