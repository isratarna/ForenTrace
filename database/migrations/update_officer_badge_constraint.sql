ALTER TABLE officers
DROP INDEX badge_number;

ALTER TABLE officers
ADD CONSTRAINT unique_station_badge
UNIQUE(station_id, badge_number);