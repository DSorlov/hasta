import fs from 'fs';
import path from 'path';
import express from 'express';
import bodyparser from 'body-parser';
import cron from 'node-cron';

import {
  importGtfs, processGtfsRt, openDb, advancedQuery,
  getFeedInfo, getAgencies, getStops, getTrips
} from 'gtfs';

import { 
  log as _log,
  logError as _logError,
  logWarning as _logWarning
} from './utils.js'

export async function runHastaServer(config) {
  // Import our configuration
  const log = _log(config);
  const logError = _logError(config);
  const logWarning = _logWarning(config);

  const { version } = JSON.parse(fs.readFileSync(path.resolve('package.json'))); 
  const pString = config.app.providers.join("|");

  // Initialize our databases for all configured providers
  const dbs = {};
  // eslint-disable-next-line guard-for-in
  for(const provider in config.app.providers) {
    // eslint-disable-next-line no-await-in-loop   
    dbs[config.app.providers[provider]] = await openDb(config.gtfs[config.app.providers[provider]]);
  }

  // Import Functions
  async function importGtfsStaticData() {
    if (!config.app.open) {
      logWarning('GTFS Import triggered while already in maintenance mode')
      return;
    }

    log(`GTFS Import triggered`);

    const oldMode = config.open;
    config.app.open = false;

    // eslint-disable-next-line guard-for-in
    for(const provider in config.app.providers) {
      // eslint-disable-next-line no-await-in-loop
      await importGtfs(config.gtfs[config.app.providers[provider]]).then(() => true).catch((err) => err);
    }

    config.app.open = oldMode;
  }

  async function processGtfsRtUpdates() {
    if (!config.app.open) {
      logWarning('GTFS-RT Update triggered while already in maintenance mode')
      return;
    }

    log(`GTFS-RT Update triggered`);

    // eslint-disable-next-line guard-for-in
    for(const provider in config.app.providers) {
      // eslint-disable-next-line no-await-in-loop
      await processGtfsRt(config.gtfs[config.app.providers[provider]]).then(() => true).catch((err) => err)
    }
  }

  // On start always refresh the static data first
  importGtfsStaticData();
  cron.schedule(config.app.update_schedule, processGtfsRtUpdates);
  cron.schedule(config.app.import_schedule, importGtfsStaticData);


  // Initialize express application context
  const app = express();
  app.use(bodyparser.json());
  app.use(bodyparser.urlencoded({ extended: true }));

  // Sends error message to the client
  // eslint-disable-next-line no-unused-vars
  async function handleError(err, req, res, next) {
    if (req.socket.remoteAddress==="::1") {
      logError(err);
      res.status(500).json({ message: "Internal error", code: "100", debug: err.message });
    } else {
      logError(err);
      res.status(500).json({ message: "Internal error", code: "100" });
    }
  }

  // This function assserts and increases the count for a specific key
  function assertKey(req,res) {

    if (!config.app.open) {
      res.status(403).json({ message: `System is in maintinence mode`, code: "503" });
      return true;
    }

    try {
      if (config.keys[req.params.key]) {

        // Make sure the key is active
        if (!config.keys[req.params.key].active) {
          res.status(403).json({ message: `Your key is not active`, code: "501" });
          return true;
        }

        // Is the key an unlimited key
        if (config.keys[req.params.key].limit===-1) {
          config.keys[req.params.key].current++
          return false;
        }

        // Check so we have qouta left
        if (config.keys[req.params.key].current >= config.keys[req.params.key].limit) {
          res.status(403).json({ message: `Your request could not be processed as your are over your limit (${config.keys[req.params.key].limit})`, code: "502" });
          return true;
        }

        // Increase the counter by one (in memory not in file)
        config.keys[req.params.key].current++;
        return false;
      } 

      res.status(403).json({ message: "The specified key is not valid", code: "500" });
      return true;
    } catch (err) {
      handleError(err,req,res,{});
    }
  }

  // Setup Some defaults for HTTP Server
  app.disable("x-powered-by")
  app.use((req, res, next) => {
    res.append('X-Powered-By', `HASTA/${version}`);
    res.append('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.append('Pragma', 'no-cache');
    res.append('Expires', '0');
    res.append('Access-Control-Allow-Origin', ['*']);
    res.append('Access-Control-Allow-Methods', 'GET');
    res.append('Access-Control-Allow-Headers', 'Content-Type');
    res.append('Strict-Transport-Security', 'max-age=123456; includeSubDomains; preload');

    if(req.method === 'OPTIONS') {
      res.send(200);
    } else {
      next();
    }
  });


  // API-Handlers
  app.get('/', async (req, res) => {
    try {
      const response = [];
      response.push(`<html><head><title>Home Assistant Swedish Timetable API</title></head><body>`);
      response.push(`<h2><strong>Home Assistant Swedish Timetable API</strong></h2>`);
      response.push(`<p>This server is <b>${config.app.open ? 'running normally' : 'in maintenence mode' }</b>.</em></p>`);
      response.push(`<hr/><p><em><a href="https://github.com/DSorlov/hasta">Home Assistant Swedish Timetable API</a> v${version}, operated by <a href="mailto:${config.app.contact}">${config.app.contact}</a></em></p>`);
      response.push(`</body></html>`);

      res.status(200).send(response.join(''));

    } catch (err) {
      handleError(err,req,res,{});
    }
  });

  app.get('/status', async (req, res) => {
    try {
      const routes = app._router.stack.filter((r) => r.route).map((r) => r.route.path).flat();  // Get all the paths

      const response = [];
      response.push(`<html><head><title>Home Assistant Swedish Timetable API</title></head><body>`);
      response.push(`<h2><strong>Home Assistant Swedish Timetable API</strong></h2>`);
      response.push(`<p>This server is <b>${config.app.open ? 'running normally' : 'in maintenence mode' }</b>.</em></p>`);

      let secondLine = false;
      response.push(`<table style="border-collapse: collapse;" border="1"><tbody>`);
      response.push(`<tr style="height: 18px; background-color: #797979;"><td style="height: 18px; color: #ffffff;"><strong><pre> Avaliable providers </pre></strong></td></tr>`);
      // eslint-disable-next-line guard-for-in
      for(const provider in config.app.providers) {
        if (secondLine)
          response.push(`<tr style="height: 18px; background-color: #ffffff;"><td style="height: 18px;"><pre> ${config.app.providers[provider]} </pre></td></tr>`);
        else
          response.push(`<tr style="height: 18px; background-color: #eeedea;"><td style="height: 18px;"><pre> ${config.app.providers[provider]} </pre></td></tr>`);
        secondLine = !secondLine;
      }

      response.push(`</tbody></table><br/>`);

      secondLine = false;        
      response.push(`<table style="border-collapse: collapse;" border="1"><tbody>`);
      response.push(`<tr style="height: 18px; background-color: #797979;"><td style="height: 18px; color: #ffffff;"><strong><pre> Avaliable methods </pre></strong></td></tr>`);

      // eslint-disable-next-line guard-for-in
      for(const route in routes) {
        if (secondLine)
          response.push(`<tr style="height: 18px; background-color: #ffffff;"><td style="height: 18px;"><pre> ${routes[route]} </pre></td></tr>`);
        else
          response.push(`<tr style="height: 18px; background-color: #eeedea;"><td style="height: 18px;"><pre> ${routes[route]} </pre></td></tr>`);
        secondLine = !secondLine;
      }

      response.push(`</tbody></table><br/>`);
      response.push(`<hr/><p><em><a href="https://github.com/DSorlov/hasta">Home Assistant Swedish Timetable API</a> v${version}, operated by <a href="mailto:${config.app.contact}">${config.app.contact}</a></em></p>`);
      response.push(`</body></html>`);

      res.status(200).send(response.join(''));

    } catch (err) {
      handleError(err,req,res,{});
    }
  });

  app.get('/api', async (req, res) => {
    try {
      const routes = app._router.stack.filter((r) => r.route).map((r) => r.route.path).flat();  // Get all the paths
      res.status(200).json({
        software: 'Home Assistant Swedish Timetable API (HASTA)',
        version,
        mode: config.app.open ? 'open' : 'authenticated',
        contact: config.app.contact,
        providers: config.app.providers,
        paths: routes.flat() });    
    } catch (err) {
      handleError(err,req,res,{});
    }
  });

  app.get('/api/:key', async (req, res) => {
    try {
      if (config.keys[req.params.key]) {            
        res.status(200).json(config.keys[req.params.key]);
        return;
      } 

      res.status(403).json({ message: "The specified key is not valid", code: "500" });
    } catch (err) {
      handleError(err,req,res,{});
    }
  });

  app.get(['/api/:key/:provider('+pString+')'], async (req, res) => {
    if (assertKey(req,res)) return;

    try {
      const sqlFields = {
        'id': 'feedId',
        'feed_publisher_name': 'publisher',
        'feed_publisher_url': 'url',
        'feed_lang': 'language',
        'feed_version': 'version'
      };

      res.status(200).json({
        'provider': req.params.provider,
        'feeds': await getFeedInfo({}, sqlFields, [], { db: dbs[req.params.provider] })
      });
    } catch (err) {
      handleError(err,req,res,{});
    }
  });

  app.get(['/api/:key/:provider('+pString+')/agencies','/api/:key/:provider('+pString+')/agencies/byid/:id', '/api/:key/:provider('+pString+')/agencies/byname/:name'], async (req, res) => {
    if (assertKey(req,res)) return;

    try {
      const sqlWhere = {};
      if (req.params.id) sqlWhere.agency_id = req.params.id;
      if (req.params.name) sqlWhere.agency_name = req.params.name;

      const sqlFields = {
        'agency_id': 'agencyId',
        'agency_name': 'name',
        'agency_url': 'url',
        'agency_fare_url': 'fareUrl'
      };
      res.status(200).json(await getAgencies(sqlWhere, sqlFields, [], { db: dbs[req.params.provider] }));
    } catch (err) {
      handleError(err,req,res,{});
    }
  });

  app.get(['/api/:key/:provider('+pString+')/departures/byname/:name','/api/:key/:provider('+pString+')/departures/byid/:id'], async(req, res) => {
    if (assertKey(req,res)) return;

    try {
      // Lookup stop_id 
      const sqlQuery = {};
      if (req.params.name) sqlQuery.stop_name = req.params.name;
      if (req.params.id) sqlQuery.stop_id = req.params.id;
            
      const stopQueryResult = (await getStops(sqlQuery, ['stop_id'], [], { db: dbs[req.params.provider] })).map((a) => a.stop_id);
      if (stopQueryResult.length===0) {
        res.status(400).json({ message: "Specifed departure stop was not found", code: "201" });
        return;
      }

      const sqlFields = {
        'routes.route_short_name': 'routeName',
        'stop_times.stop_headsign': 'destination',
        'stop_times.arrival_time': 'arrivalTime',
        'stop_times.departure_time': 'departureTime',
        'trips.direction_id': 'direction',
        'trips.trip_id': 'tripId',
        'attributions.organization_name': 'operator',
        'agency.agency_name': 'organizer',
        'agency.agency_id': 'agencyId',
        'routes.route_desc': 'routeNotes',
        'routes.route_type': 'routeType',
        'routes.route_id': 'routeId',
        'stops.stop_name': 'stop',
        'stops.stop_id': 'stopId',
        'stop_times_updates.arrival_delay': 'arrivalDelay',
        'stop_times_updates.departure_delay': 'departureDelay'
      }
      const sqlWhere = { "stop_times.stop_id": stopQueryResult };
      const sqlOrderBy = { "stop_times.departure_time": "ASC" };
      const sqlJoin = [
        { table: 'stops', type: 'LEFT OUTER', on: 'stop_times.stop_id=stops.stop_id' },
        { table: 'attributions', type: 'LEFT OUTER', on: 'stop_times.trip_id=attributions.trip_id' },
        { table: 'trips', type: 'LEFT OUTER', on: 'stop_times.trip_id=trips.trip_id' },
        { table: 'routes', type: 'LEFT OUTER', on: 'trips.route_id=routes.route_id' },
        { table: 'agency', type: 'LEFT OUTER', on: 'routes.agency_id=agency.agency_id' },
        { table: 'stop_times_updates', type: 'LEFT OUTER', on: 'stop_times.stop_id=stop_times_updates.stop_id AND stop_times.trip_id=stop_times_updates.trip_id' },
      ];

      const advancedQueryOptions = {
        query: sqlWhere,
        fields: sqlFields,
        orderBy: sqlOrderBy,
        join: sqlJoin,
        options: { db: dbs[req.params.provider] }
      }

      const timeTableResult = await advancedQuery('stop_times', advancedQueryOptions).catch((error)=>{
        throw error;
      });
      // Get current date, time, and timezone
      const rawDate = new Date();
      const timeZoneOffset = rawDate.getTimezoneOffset();

      // Create currentDate corrected for timezone and also calculate what time it is in one hour
      const currentDate = new Date(rawDate.getTime() - (timeZoneOffset*60*1000));
      const futureDate = new Date(currentDate.getTime() + 60*60000);

      // Make a string with date for use in calculation below
      const todayString = `${currentDate.toISOString().split('T')[0]}T`;

      // Return timeTableResults for the next hour
      // eslint-disable-next-line array-callback-return
      res.status(200).json(timeTableResult.filter((a) => {
        const resultDate = new Date(todayString + a.departureTime);
        if (resultDate > currentDate && resultDate < futureDate) {
          return a;
        }
      }));
    } catch (err) {
      handleError(err,req,res,{});
    }        
  });

  app.get(['/api/:key/:provider('+pString+')/alerts','/api/:key/:provider('+pString+')/alerts/bystop/:stop', '/api/:key/:provider('+pString+')/alerts/byroute/:route', '/api/:key/:provider('+pString+')/alerts/bycombination/:route/:stop'], async (req, res) => {
    if (assertKey(req,res)) return;

    try {
      const sqlWhere = {};
      if (req.params.stop) sqlWhere.stop_id = req.params.stop;
      if (req.params.route) sqlWhere.route_id = req.params.route;

      const sqlFields = {
        'alert_id': 'alertId',
        'stop_id': 'stopId',
        'route_id': 'routeId',
        'start_time': 'startTime',
        'end_time': 'endTime',
        'cause': 'cause',
        'headline': 'headline',
        'description': 'description',
      };

      const sqlJoin = [
        { table: 'service_alerts', type: 'INNER', on: 'service_alert_targets.alert_id=service_alerts.id' },
      ];

      const advancedQueryOptions = {
        query: sqlWhere,
        fields: sqlFields,
        join: sqlJoin,
        options: { db: dbs[req.params.provider] }
      }

      res.status(200).json(await advancedQuery('service_alert_targets',advancedQueryOptions));
    } catch (err) {
      handleError(err,req,res,{});
    }
  });

  app.get(['/api/:key/:provider('+pString+')/stops','/api/:key/:provider('+pString+')/stops/byid/:id', '/api/:key/:provider('+pString+')/stops/byname/:all(all)?/:name'], async (req, res) => {
    if (assertKey(req,res)) return;

    try {
      const sqlWhere = {};
      const sqlFields = {
        'stop_id': 'stopId',
        'stop_name': 'name',
        'stop_lat': 'lat',
        'stop_lon': 'lon',
        'parent_station': 'parent',
        'platform_code': 'platform'
      };

      if (!req.params.all) {
        sqlWhere.parent_station = null
      } 

      if (req.params.id) {
        sqlWhere.stop_id = req.params.id
      }

      if (req.params.name) {
        sqlWhere.stop_name = req.params.name
      }

      res.status(200).json(await getStops(sqlWhere, sqlFields, [], { db: dbs[req.params.provider] }));
    } catch (err) {
      handleError(err,req,res,{});
    }
  });

  app.get(['/api/:key/:provider('+pString+')/routes','/api/:key/:provider('+pString+')/routes/bystopid/:stop','/api/:key/:provider('+pString+')/routes/bystopname/:name'], async (req, res) => {
    if (assertKey(req,res)) return;

    try {

      const sqlQuery = {};
      if (req.params.name) sqlQuery.stop_name = req.params.name;
      if (req.params.stop) sqlQuery.stop_id = req.params.stop;
            
      let stopQueryResult = {};
      let sqlWhere = {};
      if (req.params.name||req.params.stop) {
        stopQueryResult = (await getStops(sqlQuery, ['stop_id'], [], { db: dbs[req.params.provider] })).map((a) => a.stop_id);
        if (stopQueryResult.length===0) {
          res.status(400).json({ message: "Specifed departure stop was not found", code: "201" });
          return;
        }

        sqlWhere = { "stop_times.stop_id": stopQueryResult };
      }

      const sqlJoin = "INNER JOIN trips ON routes.route_id=trips.route_id INNER JOIN stop_times ON stop_times.trip_id=trips.trip_id"

      const sqlFields = {
        'routes.route_id': 'routeId',
        'agency_id': 'agencyId',
        'route_short_name': 'routeName',
        'route_desc': 'routeNotes',
        'route_type': 'routeType'
      }

      // FIXME: THIS SHIT IS UGLY! BETTER TO IMPROVE SQL ABOVE BUT I HAVE ABSTRACTED THE SHIT OUT OF THE SQL PARSING SHIT.
      const routes = await advancedQuery('routes', sqlWhere, sqlFields, [], sqlJoin, { db: dbs[req.params.provider] });

      res.status(200).json([...new Map(routes.map((v) => [v.routeId, v])).values()]);
    } catch (err) {
      handleError(err,req,res,{});
    }
  });

  app.get(['/api/:key/:provider('+pString+')/trips','/api/:key/:provider('+pString+')/trips/byrouteid/:route'], async (req, res) => {
    if (assertKey(req,res)) return;

    try {
      const sqlWhere = {};
      if (req.params.route) {
        sqlWhere.route_id = req.params.route;
      }

      const sqlFields = {
        'trip_id': 'tripId',
        'route_id': 'routeId',
        'service_id': 'serviceId',
        'trip_headsign': 'tripSign',
        'trip_short_name': 'tripName',
        'direction_id': 'direction'
      }
      res.status(200).json(await getTrips(sqlWhere, sqlFields, [], { db: dbs[req.params.provider] }));
    } catch (err) {
      handleError(err,req,res,{});
    }
  });
  // eslint-disable-next-line no-unused-vars
  app.use((req, res, next)=>{
    res.status(404).json({ message: "Resource not found" });
  });
  app.use(handleError);
  // Start the application listener
  app.listen(config.app.port || 3000, () => {
    log(`HASTA is now listening on port ${config.app.port}`);
  });

}