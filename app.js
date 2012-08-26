/**
 *                             _/                  _/                                    _/
 *      _/_/_/      _/_/    _/_/_/_/    _/_/_/  _/_/_/_/    _/_/      _/_/      _/_/_/  _/_/_/      _/_/    _/_/_/
 *     _/    _/  _/    _/    _/      _/    _/    _/      _/    _/  _/_/_/_/  _/_/      _/    _/  _/    _/  _/    _/
 *    _/    _/  _/    _/    _/      _/    _/    _/      _/    _/  _/            _/_/  _/    _/  _/    _/  _/    _/
 *   _/_/_/      _/_/        _/_/    _/_/_/      _/_/    _/_/      _/_/_/  _/_/_/    _/    _/    _/_/    _/_/_/
 *  _/                                                                                                  _/
 * _/                                                                                                  _/
 *
 * @author: geraldyeo
 * Date: 14/8/12
 */
// requires
var flatiron = require('flatiron'),
    nconf = require('nconf'),
    redis = require('redis'),
    ecstatic = require('ecstatic'),
    instagram = require('instagram-node-lib');

//----- flatiron --------------------------------------------------
var app = flatiron.app;

app.use(flatiron.plugins.http, {
    before:[
        ecstatic(__dirname + '/public')
    ]
});

app.router.configure({ 'strict':false });

//----- redis server --------------------------------------------------
nconf.file({ file:'./config/redisconfig.json' });

var port = nconf.get('database:port'),
    host = nconf.get('database:host'),
    pass = nconf.get('database:password'),
    redisClient = redis.createClient(port, host);

redisClient.auth(pass, function (err) {
    if (err) {
        throw err;
    }
});

redisClient.on('error', function (err) {
    console.log("error event - " + redisClient.host + ":" + redisClient.port + " - " + err);
});

redisClient.on('ready', function () {
    console.log("redis ready");
    redisClient.flushdb(function (err) {
        console.log("error flushdb - " + err);
    });
});

//----- instagram config --------------------------------------------------
nconf.file({ file:'./config/instagramconfig.json' });

var instagramClientId = nconf.get('id'),
    instagramClientSecret = nconf.get('secret'),
    instagramRedirectUrl = nconf.get('redirect_url');

instagram.set('client_id', instagramClientId);
instagram.set('client_secret', instagramClientSecret);
instagram.set('callback_url', instagramRedirectUrl);

var loadRecent = function (note) {
    // Every notification object contains the id of the tag
    // that has been updated
    redisClient.del('photoset', function (err) {
        console.log("error del photoset - " + err);
    });

    var cb = function (medias, pagination) {
        medias.forEach(function (media) {
            redisClient.sadd('photoset', JSON.stringify(media));
        });

        // buildup the cache of photos until the last one...
        if (pagination.next_max_id) {
            console.log('next_max_id:', pagination.next_max_id);

            instagram.tags.recent({
                                      name    :note.object_id,
                                      max_id  :pagination.next_max_id,
                                      complete:cb
                                  });
        }
        else {
            redisClient.smembers('photoset', function (err, photos) {
                if (!photos) {
                    photos = [];
                }

                var ret = [];
                photos.forEach(function (photo) {
                    ret.push(JSON.parse(photo));
                });

                console.log('send to client');
                io.sockets.emit('photo', JSON.stringify(ret));
            });
        }
    };

    // go
    instagram.tags.recent({
                              name    :note.object_id,
                              max_id  :'',
                              complete:cb
                          });
};

//----- routes --------------------------------------------------
// callback
app.router.path('/callback', function () {
    // GET /callback
    // If param hub.challenge is present, renders its value.
    // This URL is used by subscription system of Instagram
    // to check if the callback URL provided when creating
    // the subscription is valid and works fine.
    this.get(function () {
        if (this.req.query['hub.challenge'] != null) {
            this.res.writeHead(200, { 'content-type':'text/plain' });
            this.res.end(this.req.query['hub.challenge']);
        }
        else {
            app.log.info("ERROR on subscription request: %s");
        }
    });


    // POST /callback
    // Receives POST notifications when a new photo is tagged
    // with tags of your choosing.
    this.post(function () {
        console.log('received photo notifications');
        this.req.body.forEach(loadRecent);
        this.res.writeHead(200);
    });
});


// start the server
app.start(8080, function (err) {
    if (err) {
        throw err;
    }
    var addr = app.server.address();
    app.log.info('listening on http://' + addr.address + ':' + addr.port);
});


//----- socket.io --------------------------------------------------
var io = require('socket.io').listen(app.server);
io.sockets.on('connection', function (socket) {
    console.log("connected");
    loadRecent({object_id:'fuzztography'});
});