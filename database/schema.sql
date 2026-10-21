SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS dashboard_builder
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dashboard_builder;

DROP TABLE IF EXISTS elements;
DROP TABLE IF EXISTS sections;
DROP TABLE IF EXISTS dashboards;
DROP TABLE IF EXISTS uploads;

CREATE TABLE dashboards (
  id           CHAR(36) CHARACTER SET ascii NOT NULL,
  name         VARCHAR(120) NOT NULL,
  canvas_width INT UNSIGNED NOT NULL DEFAULT 1200,
  settings     JSON NOT NULL,
  version      INT UNSIGNED NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sections (
  id           CHAR(36) CHARACTER SET ascii NOT NULL,
  dashboard_id CHAR(36) CHARACTER SET ascii NOT NULL,
  x            INT NOT NULL,
  y            INT NOT NULL,
  width        INT UNSIGNED NOT NULL,
  height       INT UNSIGNED NOT NULL,
  z_index      INT NOT NULL DEFAULT 0,
  style        JSON NOT NULL,
  sort_order   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_sections_dashboard (dashboard_id, sort_order),
  CONSTRAINT fk_sections_dashboard FOREIGN KEY (dashboard_id)
    REFERENCES dashboards (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE elements (
  id         CHAR(36) CHARACTER SET ascii NOT NULL,
  section_id CHAR(36) CHARACTER SET ascii NOT NULL,
  type       ENUM('text', 'image', 'chart') NOT NULL,
  x          INT NOT NULL,
  y          INT NOT NULL,
  width      INT UNSIGNED NOT NULL,
  height     INT UNSIGNED NOT NULL,
  z_index    INT NOT NULL DEFAULT 0,
  style      JSON NOT NULL,
  content    JSON NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_elements_section (section_id, sort_order),
  CONSTRAINT fk_elements_section FOREIGN KEY (section_id)
    REFERENCES sections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE uploads (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  filename      VARCHAR(64) CHARACTER SET ascii NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(32) CHARACTER SET ascii NOT NULL,
  size_bytes    INT UNSIGNED NOT NULL,
  width         INT UNSIGNED NOT NULL,
  height        INT UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_uploads_filename (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
