-- Campus Lost and Found: clean schema (no data).
-- Usage:  mysql -u root -p < db/schema.sql
-- Then create an administrator:  node scripts/create-admin.js (see README.md)

CREATE DATABASE IF NOT EXISTS `campus_lost_found`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `campus_lost_found`;

CREATE TABLE IF NOT EXISTS `users` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `full_name`  VARCHAR(100) NOT NULL,
  `student_id` VARCHAR(50)  DEFAULT NULL,
  `email`      VARCHAR(100) NOT NULL,
  `password`   VARCHAR(255) NOT NULL,
  `role`       ENUM('student','admin') NOT NULL DEFAULT 'student',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `student_id` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `items` (
  `id`              INT NOT NULL AUTO_INCREMENT,
  `user_id`         INT NOT NULL,
  `title`           VARCHAR(150) NOT NULL,
  `description`     TEXT DEFAULT NULL,
  `category`        VARCHAR(100) DEFAULT NULL,
  `location`        VARCHAR(255) NOT NULL,
  `date_lost_found` DATE NOT NULL,
  `item_type`       ENUM('lost','found') NOT NULL,
  `image`           VARCHAR(255) DEFAULT NULL,
  `status`          ENUM('lost','found','claimed','returned') NOT NULL,
  `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_items_type_status` (`item_type`, `status`),
  CONSTRAINT `items_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `claims` (
  `id`          INT NOT NULL AUTO_INCREMENT,
  `item_id`     INT NOT NULL,
  `claimant_id` INT NOT NULL,
  `message`     TEXT DEFAULT NULL,
  `status`      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `item_id` (`item_id`),
  KEY `claimant_id` (`claimant_id`),
  CONSTRAINT `claims_ibfk_1` FOREIGN KEY (`item_id`)     REFERENCES `items` (`id`) ON DELETE CASCADE,
  CONSTRAINT `claims_ibfk_2` FOREIGN KEY (`claimant_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
