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
-- Table structure for table `service`
--

DROP TABLE IF EXISTS `service`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `service` (
  `service_id` int NOT NULL AUTO_INCREMENT,
  `merchant_id` int NOT NULL,
  `service_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `duration_mins` int NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`service_id`),
  KEY `merchant_id` (`merchant_id`),
  CONSTRAINT `service_ibfk_1` FOREIGN KEY (`merchant_id`) REFERENCES `merchant` (`merchant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `service`
--

LOCK TABLES `service` WRITE;
/*!40000 ALTER TABLE `service` DISABLE KEYS */;
INSERT INTO `service` VALUES (1,1,'Haircut','Classic haircut and styling','Hair',35.00,45,1),(2,1,'Facial','Deep cleanse facial treatment','Facial',65.00,60,1),(3,1,'Manicure','Gel manicure with nail art','Nails',45.00,50,1),(4,2,'Gel Manicure','Long-lasting gel polish with base & top coat','Nails',38.00,45,1),(5,2,'Gel Pedicure','Soak & gel polish with cuticle care','Nails',45.00,60,1),(6,2,'Nail Art Extension','Acrylic/gel extension with custom nail art','Nails',90.00,90,1),(7,2,'Classic Manicure','File, shape, buff & regular polish','Nails',25.00,30,1),(8,2,'Spa Pedicure','Foot soak, scrub, massage & polish','Nails',55.00,75,1),(9,3,'Swedish Massage','Relaxing full-body Swedish massage','Spa',90.00,60,1),(10,3,'Deep Tissue Massage','Targeted deep-tissue relief for muscle tension','Spa',110.00,75,1),(11,3,'Hot Stone Massage','Warm volcanic stones + aromatherapy oils','Spa',130.00,90,1),(12,3,'Aromatherapy Facial','Calming essential oil facial with masque','Spa',85.00,60,1),(13,3,'Body Scrub & Wrap','Full-body exfoliation + nourishing body wrap','Spa',120.00,90,1),(14,4,'Haircut & Blowdry','Precision cut + professional blowdry','Hair',55.00,60,1),(15,4,'Hair Colouring','Single-process colour with treatment','Hair',120.00,120,1),(16,4,'Balayage & Highlights','Hand-painted balayage or foil highlight','Hair',200.00,150,1),(17,4,'Keratin Treatment','Brazilian keratin smoothing treatment','Hair',280.00,180,1),(18,4,'Scalp Treatment','Deep scalp detox & nourishment therapy','Nails',70.00,30,1),(19,5,'Hydra Facial','HydraFacial MD — cleanse, exfoliate & hydrate','Facial',158.00,75,1),(20,5,'LED Light Therapy','Anti-aging & acne-fighting LED phototherapy','Facial',68.00,30,1),(21,5,'Chemical Peel','Superficial peel for skin renewal & radiance','Facial',95.00,45,1),(22,5,'Acne Treatment','Targeted extraction & calming acne therapy','Facial',85.00,60,1),(23,5,'Anti-Aging Facial','Peptide-powered firming & lifting facial','Facial',120.00,75,1),(24,6,'Yoga Class (60 min)','All-levels hatha yoga — mat provided','Wellness',35.00,60,1),(25,6,'Pilates Class','Reformer pilates for core strength & posture','Wellness',45.00,60,1),(26,6,'Lymphatic Drainage','Gentle manual lymphatic drainage massage','Wellness',95.00,60,1),(27,6,'Prenatal Massage','Safe & nurturing massage for expectant mothers','Wellness',85.00,60,1),(28,6,'Reflexology','Traditional foot reflexology for total wellbeing','Wellness',60.00,45,1),(29,7,'Classic Lash Set','1:1 individual lash extensions, natural look','Aesthetics',68.00,90,1),(30,7,'Volume Lash Set','Russian volume fans for dramatic fullness','Aesthetics',98.00,120,1),(31,7,'Lash Lift & Tint','Lifts natural lashes for a curled, tinted look','Aesthetics',58.00,60,1),(32,7,'Brow Shaping & Tint','Precision brow shaping + tinting for bold brows','Aesthetics',38.00,45,1),(33,7,'Lash Removal','Gentle professional removal of lash extensions','Aesthetics',25.00,30,1),(34,8,'Full Face Makeup','Glam or natural everyday makeup look','Body',80.00,60,1),(35,8,'Bridal Makeup','Bridal glam with trial + day-of touch-ups','Body',250.00,120,1),(36,8,'Body Waxing','Arms, legs or underarm wax — gentle hot wax','Body',40.00,30,1),(37,8,'Brazilian Wax','Full Brazilian with soothing after-care','Body',58.00,30,1),(38,8,'Eyebrow Threading','Precise brow shaping by thread technique','Body',15.00,15,1),(39,9,'Hair Colouring','Professional full hair colouring service including consultation, colour application, wash, and styling finish.','Hair',120.00,150,1),(40,9,'Haircut & Wash','Includes haircut, hair wash, and basic styling.','Hair',35.00,45,1),(41,9,'Keratin treatment','Smoothening treatment to reduce frizz and add shine for long-lasting manageable hair.','Hair',180.00,180,1),(42,9,'Scalp Treatment','Deep cleaning scalp therapy to reduce oil buildup and improve scalp health.','Hair',65.00,60,1),(43,9,'Hair Rebonding','Permanent hair straightening treatment with wash and finishing','Hair',250.00,240,1),(44,16,'Swedish Relaxation Massage','Gentle full-body massage focused on relaxation and stress relief.','Massage',68.00,60,1),(45,16,'Deep Tissue Massage','Targets muscle tension and soreness using deeper pressure techniques.','Massage',88.00,75,1),(46,16,'Aromatherapy Massage','Relaxing massage using essential oils to calm the mind and body.','Massage',78.00,60,1),(47,16,'Hot Stone Therapy','Warm stone massage designed to improve circulation and relieve tight muscles.','Massage',110.00,90,1),(48,16,'Head, Neck & Shoulder Massage','Focused upper body massage perfect for office fatigue and tension headaches','Massage',45.00,30,1),(49,10,'Signature Hydration Facial','Deep cleanse, gentle exfoliation, hydrating mask, and serum infusion for soft, refreshed skin.','Facial',68.00,60,1),(50,10,'Acne Calm Facia','Clarifying facial for congested or acne-prone skin with extraction, calming mask, and soothing finish.','Facial',78.00,75,1),(51,10,'Brightening Glow Facial','Vitamin-rich treatment to improve dullness, uneven tone, and tired-looking skin.','Facial',88.00,75,1),(52,10,'Sensitive Skin Recovery Facial','Gentle barrier-repair facial for redness, dryness, or easily irritated skin.','Facial',72.00,60,1),(53,10,'Premium Collagen Lift Facia','Firming facial with collagen mask and lifting massage for a plumper, smoother look.','Facial',118.00,90,1),(54,11,'Classic Gel Manicure','Nail shaping, cuticle care, gel polish application, and glossy finish.','Nails',38.00,45,1),(55,11,'Gel Pedicure','Foot soak, nail shaping, cuticle care, gel polish, and light foot massage.	','Nails',48.00,60,1),(56,11,'Minimal Nail Art Set','Gel manicure with simple nail art such as dots, lines, chrome accents, or small gems.','Nails',58.00,75,1),(57,11,'Soft Gel Extensions','Lightweight soft gel extensions with shaping, gel colour, and basic finishing.','Nails',88.00,90,1),(58,11,'Bridal Bloom Nail Set','Elegant custom nail design with soft florals, pearls, shimmer, or French details.','Nails',108.00,105,1),(59,8,'French Manicure','Classic French tip manicure','Nails',30.00,60,1);
/*!40000 ALTER TABLE `service` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:28:08
