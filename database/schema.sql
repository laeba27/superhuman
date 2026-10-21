-- Dashboard Builder schema (MySQL 8.0+)
-- Usage: mysql -u root -p < database/schema.sql

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS dashboard_builder
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dashboard_builder;

DROP TABLE IF EXISTS elements;
DROP TABLE IF EXISTS sections;
DROP TABLE IF EXISTS dashboards;
DROP TABLE IF EXISTS uploads;

-- One row per dashboard. `version` goes up on every save so two tabs
-- can't silently overwrite each other.
CREATE TABLE dashboards (
  id           CHAR(36) CHARACTER SET ascii NOT NULL,
  name         VARCHAR(120) NOT NULL,
  canvas_width INT UNSIGNED NOT NULL DEFAULT 1200,
  settings     JSON NOT NULL,            -- {background, gridSize, snapToGrid}
  version      INT UNSIGNED NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sections are boxes on the canvas. Position is in canvas pixels (1200 wide).
CREATE TABLE sections (
  id           CHAR(36) CHARACTER SET ascii NOT NULL,
  dashboard_id CHAR(36) CHARACTER SET ascii NOT NULL,
  x            INT NOT NULL,
  y            INT NOT NULL,
  width        INT UNSIGNED NOT NULL,
  height       INT UNSIGNED NOT NULL,
  z_index      INT NOT NULL DEFAULT 0,
  style        JSON NOT NULL,            -- {fill, opacity, radius, border, shadow}, see below
  sort_order   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_sections_dashboard (dashboard_id, sort_order),
  CONSTRAINT fk_sections_dashboard FOREIGN KEY (dashboard_id)
    REFERENCES dashboards (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Elements live inside a section. Position is measured from the section's
-- top-left corner. `style` has the same shape as a section's:
--   {fill: {type: none|solid|linear, color | from, to, angle},
--    opacity 0-100, radius px, border: {width, color}, shadow: none|sm|md|lg|glow}
-- `content` depends on `type`:
--   text  {html}
--   image {src, fit, alt}
--   chart {chartType, title, dataSource, showLegend, labels, datasets,
--          metric, granularity, points, refreshSec}
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

-- Record of every uploaded image. The file itself is in public/uploads/.
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
