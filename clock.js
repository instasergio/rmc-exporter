const request = require('request')

const client_id = process.env.CLIENT_ID
const client_secret = process.env.CLIENT_SECRET
const refresh_token = process.env.REFRESH_TOKEN

let access_token
let token_refresh_time

const playlistIdMain = '32jmNqf6iLAf3oqhmNNspd'
const playlistIdLive = '6ohV6Zqtj1yFrgvygwfFf3'

const stationName = 'monte-carlo-spb'
const url = 'https://recordrussia.ru/api/station/' + stationName + '/current'

const livePlaylistLimit = 10

function addTrackFromRadio() {
    function getTrackFromRadio(completion) {
        // get song from radio
        const options = {
            url: url,
            json: true
        }
        request.get(options, (error, response, body) => {
            const artist = body.data.artist,
                song = body.data.title

            const searchRequest = artist + " " + song

            console.log('On radio now: ' + searchRequest)

            completion(searchRequest)
        })
    }

    function updateAuthToken(completion) {
        // check should update token
        if (token_refresh_time > Date.now()) {
            completion(true)
            return
        }
        // update auth_token
        // should make update not every time
        const options = {
            url: 'https://accounts.spotify.com/api/token',
            headers: { 'Authorization': 'Basic ' + (new Buffer.from(client_id + ':' + client_secret).toString('base64')) },
            form: {
                grant_type: 'refresh_token',
                refresh_token: refresh_token
            },
            json: true
        }
        request.post(options, (error, response, body) => {
            if (!error && response.statusCode === 200) {
                access_token = body.access_token;
                token_refresh_time = Date.now() + body.expires_in * 1000
                console.log('New access token generated \n')

                completion(true)
            } else {
                console.error(body, refresh_token)
                completion(false)
            }
        })
    }

    function searchTrackOnSpotify(track, completion) {
        // request spotify search track
        const options = {
            url: 'https://api.spotify.com/v1/search?q=' + encodeURIComponent(track) + '&type=track&limit=1',
            headers: { 'Authorization': 'Bearer ' + access_token },
            json: true
        }

        request.get(options, function (error, response, body) {
            if (response.statusCode === 401) {
                console.log(response.statusMessage + ' Invalid access token')
                // unauthorized()
            } else {
                if (body && body.tracks && body.tracks.items && body.tracks.items[0] && body.tracks.items[0].uri) {
                    let foundTrack = body.tracks.items[0]
                    console.log('Found track uri: ' + body.tracks.items[0].uri)
                    completion(true, foundTrack)
                } else {
                    completion(false, null)
                }
            }
        })
    }

    function addTrackToMainPlaylist(track) {
        const options = {
            url: 'https://api.spotify.com/v1/playlists/' + playlistIdMain + '/tracks?position=0&uris=' + track.uri,
            headers: { 'Authorization': 'Bearer ' + access_token },
            json: true
        }
        request.post(options, function (error, response, body) {
            if (!error && response.statusCode === 201) {
                console.log('Track added to MAIN playlist')
            } else {
                console.error('Error on add track to MAIN playlist')
            }
        })
    }

    function addTrackToLivePlaylist(track, position) {
        const options = {
            url: 'https://api.spotify.com/v1/playlists/' + playlistIdLive + '/tracks?position=' + position + '&uris=' + track.uri,
            headers: { 'Authorization': 'Bearer ' + access_token },
            json: true
        }

        request.post(options, function (error, response, body) {
            if (!error && response.statusCode === 201) {
                console.log('Track added to LIVE playlist')
            } else {
                console.error('Error on add track to LIVE playlist')
            }
        })
    }

    function livePlaylistTracksCount(completion) {
        const options = {
            url: 'https://api.spotify.com/v1/playlists/' + playlistIdLive + '/tracks?market=GB',
            headers: { 'Authorization': 'Bearer ' + access_token },
            json: true
        }

        request.get(options, (error, message, body) => {
            const total = body.total

            if (total != null) {
                let trackToRemove
                if (total >= livePlaylistLimit) {
                    trackToRemove = body.items[0]
                }
                completion(true, total, trackToRemove)
            } else {
                completion(false, null)
            }
        })
    }

    function removeTrackFromLivePlaylist(track, completion) {
        var options = {
            url: 'https://api.spotify.com/v1/playlists/' + playlistIdLive + '/tracks',
            headers: { 'Authorization': 'Bearer ' + access_token },
            json: true,
            body: {
                tracks: [{
                    uri: track.track.uri,
                    positions: [
                        0
                    ]
                }]
            }
        }

        request.del(options, function (error, response, body) {
            if (!error && response.statusCode === 200) {
                completion(true)
            } else {
                completion(false)
            }
        })
    }

    function firstTrackOfMainPlaylistMatches(track, completion) {
        // request first track of playlist
        const options = {
            url: 'https://api.spotify.com/v1/playlists/' + playlistIdMain + '/tracks',
            headers: { 'Authorization': 'Bearer ' + access_token },
            json: true
        }
        request.get(options, (error, response, body) => {
            let firstTrackInPlaylist = body.items[0].track
            console.log('First track in playlist uri: ' + body.items[0].track.uri)

            if (firstTrackInPlaylist.uri === track.uri) {
                completion(false, track)
            } else {
                console.log('Track is new')
                completion(true, track)
            }
        })
    }

    new Promise((resolve) => {
        getTrackFromRadio((trackName) => {
            resolve(trackName)
        })
    }).then((trackName) => {
        return new Promise((resolve, reject) => {
            updateAuthToken((success) => {
                if (success) {
                    resolve(trackName)
                } else {
                    reject('Error updating auth token')
                }
            })
        })
    }).then((trackName) => {
        return new Promise((resolve, reject) => {
            searchTrackOnSpotify(trackName, (success, foundTrack) => {
                if (success) {
                    resolve(foundTrack)
                } else {
                    reject('Track not found on spotify.')
                }
            })
        })
    }).then((track) => {
        return new Promise((resolve, reject) => {
            firstTrackOfMainPlaylistMatches(track, (success, track) => {
                if (success) {
                    resolve(track)
                } else {
                    reject('Track already in playlist.')
                }
            })
        })
    }).then((track) => {
        addTrackToMainPlaylist(track)

        return new Promise((resolve, reject) => {
            livePlaylistTracksCount((success, count, trackToRemove) => {
                if (success) {
                    resolve({
                        "count": count,
                        "trackToRemove": trackToRemove
                    })
                } else {
                    reject('Error on retrive LIVE playlist tracks count')
                }
            })
        }).then((object) => {
            const count = object.count
            const trackToRemove = object.trackToRemove

            if (trackToRemove) {
                return new Promise((resolve, reject) => {
                    removeTrackFromLivePlaylist(trackToRemove, (success) => {
                        if (success) {
                            resolve(count - 1)
                        } else {
                            reject('Error on remove track from LIVE playlist')
                        }
                    })
                })
            } else {
                return count
            }
        }).then((count) => {
            addTrackToLivePlaylist(track, count)
        })
    }).catch((info) => {
        console.error(info)
    })
}

addTrackFromRadio()
setInterval(addTrackFromRadio, 60000)