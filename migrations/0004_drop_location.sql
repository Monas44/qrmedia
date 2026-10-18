-- Fora da Cloudflare não há geolocalização por IP; as colunas ficariam sempre vazias.
ALTER TABLE scans DROP COLUMN country;
ALTER TABLE scans DROP COLUMN region;
ALTER TABLE scans DROP COLUMN city;
ALTER TABLE scans DROP COLUMN latitude;
ALTER TABLE scans DROP COLUMN longitude;
ALTER TABLE scans DROP COLUMN timezone;
