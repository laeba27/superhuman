SET NAMES utf8mb4;
USE dashboard_builder;

ALTER TABLE elements ADD COLUMN style JSON NULL AFTER z_index;

UPDATE sections
SET style = JSON_OBJECT(
  'fill', JSON_OBJECT('type', 'solid', 'color', COALESCE(style->>'$.background', '#ffffff')),
  'opacity', 100,
  'radius', LEAST(CAST(COALESCE(style->'$.borderRadius', 8) AS UNSIGNED), 200),
  'border', IF(COALESCE(style->>'$.borderColor', 'transparent') = 'transparent',
               JSON_OBJECT('width', 0, 'color', '#e3e6eb'),
               JSON_OBJECT('width', 1, 'color', style->>'$.borderColor')),
  'shadow', 'none')
WHERE NOT JSON_CONTAINS_PATH(style, 'one', '$.fill');

UPDATE elements
SET style = JSON_OBJECT(
  'fill', JSON_OBJECT('type', 'none'),
  'opacity', 100,
  'radius', IF(type = 'image', LEAST(CAST(COALESCE(content->'$.borderRadius', 0) AS UNSIGNED), 200), 0),
  'border', JSON_OBJECT('width', 0, 'color', '#e3e6eb'),
  'shadow', 'none')
WHERE style IS NULL;

UPDATE elements SET content = JSON_REMOVE(content, '$.borderRadius')
WHERE type = 'image' AND JSON_CONTAINS_PATH(content, 'one', '$.borderRadius');

ALTER TABLE elements MODIFY style JSON NOT NULL;
