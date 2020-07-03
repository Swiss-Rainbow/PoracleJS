/* eslint class-methods-use-this: ["error", { "exceptMethods": ["getGeocoder"] }] */

const config = require('config')
const inside = require('point-in-polygon')
const _ = require('lodash')
const NodeGeocoder = require('node-geocoder')
const child = require('child_process')

const ivColorData = config.discord.iv_colors
const axios = require('axios')
const emojiFlags = require('emoji-flags')
const moment = require('moment')
const S2 = require('s2-geometry').S2
const uuid = require('uuid/v4')
const Cache = require('ttl')
const geofence = require('../../config/geofence.json')
const baseStats = require('../util/base_stats')
const cpMultipliers = require('../util/cp-multipliers')
const questDts = require('../../config/questdts')
const messageDts = require('../../config/dts')

const pcache = require('../helpers/persistent-cache')

const log = require('../logger')

const discordcache = new Cache({
	ttl: config.discord.limitsec * 1000,
})
discordcache.on('put', (key, val, ttl) => { })
discordcache.on('hit', (key, val) => { })

// setup geocoding cache

const addrCache = pcache({
	base: '.cache',
	name: 'addrCache',
	duration: 30 * 24 * 3600 * 1000, // 30 days is what google allows
})

const weatherCache = pcache({
	base: '.cache',
	name: 'weatherCache',
	duration: 30 * 24 * 3600 * 1000, // 30 days is what google allows
})

class Controller {

	constructor(db) {
		this.db = db
		this.log = log
		this.qdts = questDts
		this.mdts = messageDts
		this.ivColorData = ivColorData
		this.geofence = geofence
		this.cpMultipliers = cpMultipliers
		this.discordcache = discordcache
		this.uuid = uuid()
		this.cp = child

	}

	// Geocoding stuff below


	getGeocoder() {
		switch (config.geocoding.provider.toLowerCase()) {
			case 'poracle': {
				return NodeGeocoder({
					provider: 'openstreetmap',
					osmServer: 'https://geocoding.poracle.world/nominatim/',
					formatterPattern: config.locale.addressformat,
				})
			}
			case 'google': {
				return NodeGeocoder({
					provider: 'google',
					httpAdapter: 'https',
					apiKey: _.sample(config.geocoding.geocodingKey),
				})
			}
			default:
			{
				return NodeGeocoder({
					provider: 'openstreetmap',
					osmServer: config.geocoding.osmServer ? config.geocoding.osmServer : 'http://nominatim.openstreetmap.org',
					formatterPattern: config.locale.addressformat,
				})
			}
		}
	}

	async geolocate(locationString) {
		return new Promise((resolve, reject) => {
			this.getGeocoder().geocode(locationString)
				.then((result) => {
					resolve(result)
					log.log({ level: 'debug', message: `geolocate ${locationString}`, event: 'geo:geolocate' })
				})
				.catch((err) => {
					reject(log.error(`Geolocate failed with error: ${err}`))
				})
		})
	}

	async getAddress(locationObject) {
		return new Promise((resolve) => {
			const cacheKey = `${locationObject.lat}-${locationObject.lon}`
			const res = {}
			addrCache.get(cacheKey, (err, addr) => {
				if (err) log.error(err)
				if (!addr) {
					this.getGeocoder().reverse(locationObject)
						.then((geocodeResult) => {
							res.addr = config.locale.addressformat
								.replace(/%n/, geocodeResult[0].streetNumber || '')
								.replace(/%S/, geocodeResult[0].streetName || '')
								.replace(/%z/, geocodeResult[0].zipcode || '')
								.replace(/%P/, geocodeResult[0].country || '')
								.replace(/%p/, geocodeResult[0].countryCode || '')
								.replace(/%c/, geocodeResult[0].city || '')
								.replace(/%T/, geocodeResult[0].state || '')
								.replace(/%t/, geocodeResult[0].stateCode || '')
							res.streetNumber = geocodeResult[0].streetNumber || ''
							res.streetName = geocodeResult[0].streetName || ''
							res.neighbourhood = geocodeResult[0].neighbourhood || ''
							res.zipcode = geocodeResult[0].zipcode || ''
							res.country = geocodeResult[0].country || ''
							res.countryCode = geocodeResult[0].countryCode || ''
							res.city = geocodeResult[0].city || ''
							res.state = geocodeResult[0].state || ''
							res.stateCode = geocodeResult[0].stateCode || ''
							const flag = emojiFlags[`${res.countryCode}`]
							res.flag = flag ? flag.emoji : ''

							if (res && geocodeResult.length > 0) {
								addrCache.put(cacheKey, res, (error, r) => {
									if (error) log.error(`Error saving addr of ${cacheKey}: ${error}`)
								})
							}
							log.log({ level: 'debug', message: `getAddress ${locationObject.lat}, ${locationObject.lon}`, event: 'geo:getAddress' })
							resolve(res)
						})
						.catch((err) => {
							res.countryCode = 'EE'
							log.error('GetAddress failed with error', err)
							resolve(res)
						})
				}
				else {
					log.log({ level: 'debug', message: `getAddress ${locationObject.lat}, ${locationObject.lon}`, event: 'geo:getAddress' })
					resolve(addr)
				}
			})
		})
	}


	async pointInArea(point) {
		return new Promise((resolve) => {
			const confAreas = this.geofence.map((area) => area.name)
			const matchAreas = []
			confAreas.forEach((area) => {
				const areaObj = _.find(this.geofence, (p) => p.name.toLowerCase() === area.toLowerCase())
				if (inside(point, areaObj.path)) {
					matchAreas.push(area)
				}
			})
			log.log({ level: 'debug', message: `pointInArea ${point[0]}, ${point[1]}`, event: 'geo:pointInArea' })
			resolve(matchAreas)
		})
	}

	getDiscordCache(id) {
		let ch = _.cloneDeep(this.discordcache.get(id))
		if (ch === undefined) {
			this.discordcache.put(id, 1)
			ch = 1
		}
		return ch
	}

	addDiscordCache(id) {
		let ch = _.cloneDeep(this.discordcache.get(id))
		if (ch === undefined) {
			this.discordcache.put(id, 1)
			ch = 1
		}
		this.discordcache.put(id, ch + 1)
		return true
	}

	// DB queries


	async updateLocation(table, lat, lon, col, value) {
		return new Promise((resolve, reject) => {
			this.db.query('UPDATE ?? set latitude = ?, longitude = ? where ?? = ?', [table, lat, lon, col, value])
				.then(log.log({ level: 'debug', message: 'updateLocation query', event: 'sql:updateLocation' }))
				.catch((err) => {
					reject(log.error(`updateLocation errored with: ${err}`))
				})
		})
	}

	async selectOneQuery(table, column, value) {
		return new Promise((resolve, reject) => {
			this.db.query('SELECT * FROM ?? WHERE ?? = ?', [table, column, value])
				.then((result) => {
					log.log({ level: 'debug', message: 'selectOneQuery query', event: 'sql:selectOneQuery' })
					resolve(result[0][0])
				})
				.catch((err) => {
					reject(err)
				})
		})
	}

	async dropTableQuery(table) {
		return new Promise((resolve) => {
			const q = `DROP TABLE ${table}`
			this.db.query(q)
				.then((result) => {
					log.log({ level: 'debug', message: `dropTableQuery ${table}`, event: 'sql:dropTableQuery' })
					resolve(result[0][0])
				})
				.catch((err) => {
					log.error(`dropTableQuery errored with: ${err}`)
				})
		})
	}

	async countQuery(what, from, where, value) {
		return new Promise((resolve, reject) => {
			this.db.query('SELECT count(??) as count FROM ?? WHERE ?? = ?', [what, from, where, value])
				.then((result) => {
					log.log({ level: 'debug', message: `countQuery ${from}`, event: 'sql:countQuery' })
					resolve(result[0][0].count)
				})
				.catch((err) => {
					reject(err)
				})
		})
	}

	async insertQuery(table, columns, values) {
		return new Promise((resolve) => {
			this.db.query(`INSERT INTO ?? (${columns.join(',')}) VALUES (?)`, [table, values])
				.then(() => {
					log.log({ level: 'debug', message: `insertQuery ${table}`, event: 'sql:insertQuery' })
					resolve()
				})
				.catch((err) => {
					log.error(`inseertQuery errored with: ${err}`)
				})
		})
	}


	async insertOrUpdateQuery(table, columns, values) {

		const cols = columns.join(', ')
		const multiValues = values.map((x) => x.map((y) => (typeof y === 'boolean' ? y : `'${y}'`)).join()).join('), \n(')
		const duplicate = columns.map((x) => `\`${x}\`=VALUES(\`${x}\`)`).join(', ')
		const query = `INSERT INTO ${table} (${cols})
                      VALUES (${multiValues})
                      ON DUPLICATE KEY UPDATE ${duplicate}`
		return new Promise((resolve, reject) => {
			this.db.query(query)
				.then((result) => {
					log.log({ level: 'debug', message: `insertOrUpdateQuery ${table}`, event: 'sql:insertOrUpdateQuery' })
					resolve(result)
				})
				.catch((err) => {
					log.error(`insertOrUpdateQuery errored with: ${err}`)
					reject(err)
				})
		})
	}


	async updateQuery(table, field, newvalue, col, value) {
		return new Promise((resolve, reject) => {
			this.db.query('UPDATE ?? SET ?? = ? where ?? = ?', [table, field, newvalue, col, value])
				.then(log.log({ level: 'debug', message: `updateQuery ${table}`, event: 'sql:updateQuery' }))
				.catch((err) => {
					log.error(`inseertQuery errored with: ${err}`)
					reject(err)
				})
		})
	}


	async mysteryQuery(query) {
		return new Promise((resolve, reject) => {
			this.db.query(query)
				.then((result) => {
					log.log({ level: 'debug', message: 'mysteryQuery', event: 'sql:mysteryQuery' })
					resolve(result[0])
				})
				.catch((err) => {
					reject(log.error(`mysteryQuery errored with: ${err}`))
				})
		})
	}

	async deleteQuery(table, column, value) {
		return new Promise((resolve, reject) => {
			this.db.query('DELETE FROM ?? WHERE ?? = ?', [table, column, value])
				.then((result) => {
					resolve(result[0].count)
					log.log({ level: 'debug', message: `deleteQuery ${table}`, event: 'sql:deleteQuery' })
				})
				.catch((err) => {
					log.error(`deleteQuery errored with: ${err.message}`)
					reject(err)
				})
		})
	}

	async deleteByIdQuery(table, column, value, id) {
		return new Promise((resolve, reject) => {
			this.db.query('DELETE FROM ?? WHERE ?? = ? and id = ?', [table, column, value, id])
				.then((result) => {
					resolve(result[0].count)
					log.log({ level: 'debug', message: `deleteByIdQuery ${table}`, event: 'sql:deleteByIdQuery' })
				})
				.catch((err) => {
					log.error(`deleteQuery errored with: ${err}`)
					reject(err)
				})
		})
	}


	async selectAllQuery(table, column, value) {
		return new Promise((resolve, reject) => {
			this.db.query('SELECT * FROM ?? WHERE ?? = ?', [table, column, value])
				.then((result) => {
					log.log({ level: 'debug', message: `selectAllQuery ${table}`, event: 'sql:selectAllQuery' })
					resolve(result[0])
				})
				.catch((err) => {
					reject(log.error(`selectAllQuery errored with: ${err}`))
				})
		})
	}

	async selectAllInQuery(table, column, values) {
		return new Promise((resolve, reject) => {
			this.db.query('SELECT * FROM ?? WHERE ?? IN (?)', [table, column, values])
				.then((result) => {
					log.log({ level: 'debug', message: `selectAllInQuery ${table}`, event: 'sql:selectAllInQuery' })
					resolve(result[0])
				})
				.catch((err) => {
					reject(log.error(`selectAllInQuery errored with: ${err}`))
				})
		})
	}

	async addOneQuery(table, addable, column, value) {
		return new Promise((resolve, reject) => {
			this.db.query('update ?? set ?? = ??+1 where ?? = ?', [table, addable, addable, column, value])
				.then(() => {
					log.log({ level: 'debug', message: `addOneQuery ${table}`, event: 'sql:addOneQuery' })
					resolve()
				})
				.catch((err) => {
					reject(log.error(`addOneQuery errored with: ${err}`))
				})
		})
	}

	async getColumns(table) {
		return new Promise((resolve, reject) => {
			this.db.query(`select COLUMN_NAME from INFORMATION_SCHEMA.COLUMNS where TABLE_NAME = ? and TABLE_SCHEMA = '${config.db.database}'`, [table])
				.then((result) => {
					const colArray = []
					result[0].forEach((col) => colArray.push(col.COLUMN_NAME))
					resolve(colArray)
					log.log({ level: 'debug', message: `getColumns ${table}`, event: 'sql:getColumns' })
				})
				.catch((err) => {
					reject(log.error(`getColumns errored with: ${err}`))
				})
		})
	}

	getCp(monster, level, ivAttack, ivDefense, ivStamina) {

		const cpMulti = this.cpMultipliers[level]
		const atk = baseStats[monster].attack
		const def = baseStats[monster].defense
		const sta = baseStats[monster].stamina

		const cp = Math.max(10, Math.floor((atk + ivAttack)
			* ((def + ivDefense) ** 0.5)
			* ((sta + ivStamina) ** 0.5)
			* ((cpMulti ** 2) / 10)))
		return cp
	}

	async checkSchema() {
		return new Promise((resolve, reject) => {
			this.db.query(`select count(*) as c from information_schema.tables where table_schema='${config.db.database}'
							and table_name in('egg', 'raid', 'monsters', 'schema_version', 'gym-info', 'humans', 'quest', 'incident')`)
				.then((schematablesMatched) => {
					log.log({ level: 'debug', message: 'checkSchema', event: 'sql:checkSchema' })
					resolve(schematablesMatched[0][0].c)
				})
				.catch((err) => {
					reject(log.error(`schema checker errored with: ${err}`))
				})
		})
	}

	execPromise(command) {
		return new Promise((resolve, reject) => {
			this.cp.exec(command, (error, stdout) => {
				if (error) {
					reject(error)
					return
				}
				resolve(stdout.trim())
			})
		})
	}

	async getWeather(weatherObject) {
		return new Promise((resolve) => {
			const res = {
				current: 0,
				next: 0,
			}
			if (!config.weather.apiKey
				|| moment().hour() >= moment(weatherObject.disappear * 1000).hour()
			) {
				resolve(res)
				return
			}

			const key = S2.latLngToKey(weatherObject.lat, weatherObject.lon, 10)
			const id = S2.keyToId(key)

			weatherCache.get(id, (err, data) => {
				if (err) {
					log.error(err)
					resolve(res)
				}

				(async () => {
					const nextHourTimestamp = weatherObject.disappear - (weatherObject.disappear % 3600)
					const currentHourTimestamp = nextHourTimestamp - 3600

					// Weather must be refreshed at 3am, 11am and 19pm
					const currentMoment = moment(currentHourTimestamp * 1000)
					const currentHour = currentMoment.hour()
					// Round to next greater multiple of 8; Add offset of 3 (hours); Subtract current hour
					// eslint-disable-next-line no-bitwise
					let nextUpdateInHours = (((currentHour + ((currentHour % 8) < 3 ? 0 : 7)) & -8) + 3) % 24
					nextUpdateInHours = (nextUpdateInHours > currentHour ? nextUpdateInHours : 27) - currentHour

					const internalCacheTimeout = currentMoment.add(nextUpdateInHours, 'hours').unix()

					if (!data) {
						data = {}
						const latlng = S2.idToLatLng(id)
						// Fetch location information
						await axios.get(`https://dataservice.accuweather.com/locations/v1/cities/geoposition/search?apikey=${config.weather.apiKey}&q=${latlng.lat}%2C${latlng.lng}`)
							.then((response) => {
								data.key = response.data.Key
							})
							.catch((err) => {
								log.error(`Fetching AccuWeather location errored with: ${err}`)
								resolve(res)
							})
					}

					if (!({}).hasOwnProperty.call(data, currentHourTimestamp)) {
						// Nothing to say about current weather
						data[currentHourTimestamp] = {
							WeatherIcon: 0,
						}
					}

					if (!({}).hasOwnProperty.call(data, nextHourTimestamp)
						|| !({}).hasOwnProperty.call(data, 'internalCacheTimeout')
						|| data.internalCacheTimeout <= currentHourTimestamp
					) {
						// Delete old weather information
						Object.entries(data).forEach(([timestamp]) => {
							if (timestamp < currentHourTimestamp) {
								delete data[timestamp]
							}
						})
						// Fetch new weather information
						await axios.get(`https://dataservice.accuweather.com/forecasts/v1/hourly/12hour/${data.key}?apikey=${config.weather.apiKey}`)
							.then((response) => {
								Object.entries(response.data).forEach(([i, forecast]) => {
									data[forecast.EpochDateTime] = forecast
								})
								data.internalCacheTimeout = internalCacheTimeout
								weatherCache.put(id, data, (error, r) => {
									if (error) log.error(`Error saving weather of ${id}: ${error}`)
								})
							})
							.catch((err) => {
								log.error(`Fetching AccuWeather forecast errored with: ${err}`)
								resolve(res)
							})
					}

					const mapPoGoWeather = (weatherIcon) => {
						const mapping = {
							1: [1, 2, 30, 33, 34],
							2: [12, 15, 18, 26, 29],
							3: [3, 4, 14, 17, 21, 35, 36, 39, 41],
							4: [5, 6, 7, 8, 13, 16, 20, 23, 37, 38, 40, 42],
							5: [32],
							6: [19, 22, 24, 25, 31, 43, 44],
							7: [11],
						}

						for (const [index, map] of Object.entries(mapping)) {
							if (map.indexOf(weatherIcon) !== -1) {
								return parseInt(index, 10)
							}
						}

						return 0
					}

					resolve({
						current: mapPoGoWeather(data[currentHourTimestamp].WeatherIcon),
						next: mapPoGoWeather(data[nextHourTimestamp].WeatherIcon),
					})
				})()
			})
		})
	}

}


module.exports = Controller
