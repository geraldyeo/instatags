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
    fs = require('fs'),
    instagram = require('instagram-node-lib');

// declarations
var instagramClientId = '410dd489c1594bddb62c514cd600b590',
    instagramClientSecret = 'c625acb0b72c417eabd2a709c0854138',
    instagramRedirectUrl = 'http://instawed.jit.su/callback',
    app = flatiron.app;

app.use(flatiron.plugins.http, {
    before:[function (req, res) {
        fs.readFile(__dirname + '/index.html', function (err, data) {
            if (err) {
                res.writeHead(500);
                return res.end('Error loading index.html');
            }
            res.writeHead(200);
            res.end(data);
        });
    }]
});
app.router.configure({ 'strict':false });

//----- instagram config --------------------------------------------------
instagram.set('client_id', instagramClientId);
instagram.set('client_secret', instagramClientSecret);
instagram.set('callback_url', instagramRedirectUrl);


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
    // Each notification contains a geography_id, which is
    // the identifier of the geography that has a new photo.
    // It's necessary to perform another API call to get the last
    // photo from that geography
    this.post(function () {
        console.log('received photo notifications');

        this.req.body.forEach(function (note) {
            // Every notification object contains the id of the tag
            // that has been updated
            var cb = function (medias) {
                console.log('send to client');
                var raw = JSON.stringify(medias);
                io.sockets.emit('photo', raw);
            };

            instagram.tags.recent({
                                      name    :note.object_id,
                                      complete:cb
                                  });
        });

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
});