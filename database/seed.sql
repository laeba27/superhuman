SET NAMES utf8mb4;
USE dashboard_builder;

SET @dash   = '0b6f3c2e-5a41-4d8e-9a10-3f2c1d7e8a01';
SET @header = '1c7a4d3f-6b52-4e9f-8b21-4a3d2e8f9b02';
SET @sales  = '2d8b5e4a-7c63-4fa0-9c32-5b4e3f9a0c03';
SET @region = '3e9c6f5b-8d74-4ab1-8d43-6c5f4a0b1d04';

SET @card  = JSON_OBJECT('fill', JSON_OBJECT('type', 'solid', 'color', '#ffffff'), 'opacity', 100, 'radius', 12,
                         'border', JSON_OBJECT('width', 1, 'color', '#e3e6eb'), 'shadow', 'none');
SET @plain = JSON_OBJECT('fill', JSON_OBJECT('type', 'none'), 'opacity', 100, 'radius', 0,
                         'border', JSON_OBJECT('width', 0, 'color', '#e3e6eb'), 'shadow', 'none');

INSERT INTO dashboards (id, name, canvas_width, settings, version) VALUES
  (@dash, 'Sales Overview', 1200,
   JSON_OBJECT('background', '#f4f5f7', 'gridSize', 8, 'snapToGrid', TRUE), 1);

INSERT INTO sections (id, dashboard_id, x, y, width, height, z_index, style, sort_order) VALUES
  (@header, @dash,  24,  24, 1152, 112, 1, @card, 0),
  (@sales,  @dash,  24, 160,  744, 368, 1, @card, 1),
  (@region, @dash, 792, 160,  384, 368, 1, @card, 2);

INSERT INTO elements (id, section_id, type, x, y, width, height, z_index, style, content, sort_order) VALUES
  ('4fad7a6c-9e85-4bc2-9e54-7d6a5b1c2e05', @header, 'image', 24, 20, 72, 72, 1, @plain,
   JSON_OBJECT('src', 'assets/img/sample-logo.svg', 'fit', 'contain', 'alt', 'Company logo'), 0),
  ('5abe8b7d-af96-4cd3-8f65-8e7b6c2d3f06', @header, 'text', 112, 16, 720, 80, 1, @plain,
   JSON_OBJECT('html', '<h1 style="font-size: 28px">Sales Overview</h1><p>Q3 2026 · <b>live</b> revenue and <i>regional</i> orders at a glance</p>'), 1),

  ('6bcf9c8e-b0a7-4de4-9076-9f8c7d3e4a07', @sales, 'chart', 20, 20, 704, 328, 1, @plain,
   JSON_OBJECT('chartType', 'line', 'title', 'Revenue (live)', 'dataSource', 'api', 'showLegend', FALSE,
               'labels', JSON_ARRAY(), 'datasets', JSON_ARRAY(),
               'metric', 'revenue', 'granularity', 'live', 'points', 20, 'refreshSec', 5), 0),

  ('7cd0ad9f-c1b8-4ef5-a187-a09d8e4f5b08', @region, 'chart', 20, 20, 344, 328, 1, @plain,
   JSON_OBJECT('chartType', 'bar', 'title', 'Orders by region', 'dataSource', 'static', 'showLegend', TRUE,
               'labels', JSON_ARRAY('North', 'South', 'East', 'West', 'Central'),
               'datasets', JSON_ARRAY(
                 JSON_OBJECT('label', 'Q2', 'data', JSON_ARRAY(420, 310, 515, 280, 365), 'color', '#898781'),
                 JSON_OBJECT('label', 'Q3', 'data', JSON_ARRAY(480, 355, 590, 335, 410), 'color', '#2a78d6'))), 0);
