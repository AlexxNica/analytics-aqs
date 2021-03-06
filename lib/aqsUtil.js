'use strict';

var HyperSwitch = require('hyperswitch');
var HTTPError = HyperSwitch.HTTPError;

var aqsUtil = {};

aqsUtil.notFoundCatcher = function(e) {

    if (e.status === 404) {

        e.body.description = 'The date(s) you used are valid, but we either do ' +
            'not have data for those date(s), or the project ' +
            'you asked for is not loaded yet.  Please check ' +
            'https://wikimedia.org/api/rest_v1/?doc for more ' +
            'information.';
        e.body.type = 'not_found';
    }
    throw e;
};

/**
 * general handler functions
 */
aqsUtil.normalizeResponse = function(res) {
    // always return at least an empty array so that queries for non-existing data don't error
    res = res || {};
    res.body = res.body || {
        items: []
    };
    res.headers = res.headers || {};
    res.headers['cache-control'] = 's-maxage=86400, max-age=86400';
    res.headers['content-type'] = 'application/json; charset=utf-8';
    return res;
};

/**
 * Parameter validators
 * Only needed internally, not exposed
 */
var throwIfNeeded = function(errors) {
    if (errors && errors.length) {
        throw new HTTPError({
            status: 400,
            body: {
                type: 'invalid_request',
                detail: errors,
            }
        });
    }
};

/**
 * Normalizes the project parameter to "en.wikipedia"
 * from:
 * en.wikipedia.org, EN.WIKIPEDIA.ORG, www.en.wikipedia.org
 */
aqsUtil.normalizeProject = function(rp) {
    rp.project = rp.project.toLowerCase();
    rp.project = rp.project.replace(/^www\./, '').replace(/\.org$/, '');
};

aqsUtil.validateTimestamp = function(timestamp, opts) {
    opts = opts || {};

    if (timestamp && timestamp.length > 10) {
        return false;
    }

    try {
        var year = timestamp.substring(0, 4);
        var month = timestamp.substring(4, 6);
        var day = timestamp.substring(6, 8);
        var hour = opts.fakeHour ? '00' : timestamp.substring(8, 10);

        var dt = new Date([year, month, day].join('-') + ' '
            + hour + ':00:00 UTC');

        return dt.toString() !== 'Invalid Date'
            && dt.getUTCFullYear() === parseInt(year, 10)
            && dt.getUTCMonth() === (parseInt(month, 10) - 1)
            && dt.getUTCDate() === parseInt(day, 10)
            && dt.getUTCHours() === parseInt(hour);

    } catch (e) {
        return false;
    }
};

/**
 * Generic validator of YYYYMMDDHH timestamps, with optional HH
 *
 * Options
 *  fakeHour: add a '00' when validating a YYYYMMDD timestamp
 *  zeroHour: actually change start and end to YYYYMMDD00
 *  stripHour: change any YYYYMMDDHH to YYYYMMDD
 *  fullMonths: make date range include only full months
 *
 * Returns
 *  Nothing, but may change rp.start and rp.end
 *
 * Throws
 *  invalid date format exceptions
 */
aqsUtil.validateStartAndEnd = function(rp, opts) {
    opts = opts || {};

    var errors = [];
    var invalidMessage = opts.fakeHour ?
        'invalid, must be a valid date in YYYYMMDD format' :
        'invalid, must be a valid timestamp in YYYYMMDDHH format';

    aqsUtil.normalizeProject(rp);

    if (!aqsUtil.validateTimestamp(rp.start, opts)) {
        errors.push('start timestamp is ' + invalidMessage);
    }
    if (!aqsUtil.validateTimestamp(rp.end, opts)) {
        errors.push('end timestamp is ' + invalidMessage);
    }

    if (rp.start > rp.end) {
        errors.push('start timestamp should be before the end timestamp');
    }

    if (opts.fullMonths) {
        rp.start = aqsUtil.getFirstFullMonthFirstDay(rp.start);
        rp.end = aqsUtil.getLastFullMonthLastDay(rp.end);

        if (rp.start > rp.end) {
            errors.push('no full months found in specified date range');
        }
    }

    throwIfNeeded(errors);

    if (opts.zeroHour || opts.stripHour) {
        rp.start = rp.start.substring(0, 8);
        rp.end = rp.end.substring(0, 8);
    }
    if (opts.zeroHour) {
        rp.start += '00';
        rp.end += '00';
    }
};

aqsUtil.validateYearMonthDay = function(rp) {
    var errors = [];

    aqsUtil.normalizeProject(rp);

    // fake a timestamp in the YYYYMMDDHH format so we can reuse the validator
    var validDate = aqsUtil.validateTimestamp(
        rp.year + rp.month +
        ((rp.day === 'all-days') ? '01' : rp.day) +
        '00'
    );

    if (!validDate) {
        errors.push('Given year/month/day is invalid date');
    }

    throwIfNeeded(errors);
};

aqsUtil.convertTimestampToDate = function(timestamp) {
    var year = parseInt(timestamp.substring(0, 4), 10);
    var month = parseInt(timestamp.substring(4, 6), 10) - 1;
    var day = parseInt(timestamp.substring(6, 8), 10);
    return new Date(Date.UTC(year, month, day));
};

aqsUtil.convertDateToTimestamp = function(date) {
    return date.getUTCFullYear().toString() +
            ('0' + (date.getUTCMonth() + 1)).slice(-2) +
            ('0' + date.getUTCDate()).slice(-2);
};

aqsUtil.getFirstFullMonthFirstDay = function(startDate) {
    var dt = aqsUtil.convertTimestampToDate(startDate);

    if (dt.getUTCDate() === 1) {
        return startDate;
    } else {
        dt.setUTCMonth(dt.getUTCMonth() + 1);
        dt.setUTCDate(1);

        return aqsUtil.convertDateToTimestamp(dt);
    }
};

aqsUtil.getLastFullMonthLastDay = function(endDate) {
    var dt = aqsUtil.convertTimestampToDate(endDate);
    var lastDayOfCurrentMonth = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0));

    if (dt.getUTCDate() === lastDayOfCurrentMonth.getUTCDate()) {
        return endDate;
    } else {
        dt.setUTCDate(0);

        return aqsUtil.convertDateToTimestamp(dt);
    }
};

module.exports = aqsUtil;
