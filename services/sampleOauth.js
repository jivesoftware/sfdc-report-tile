var jive = require('jive-sdk');
var oauthUtil = jive.util.oauth;
var tokenStore = jive.service.persistence();

// overrides jive-sdk/routes/oauth.js to store access token for the viewer
// and provide oauth config to base class
var myOauth = Object.create(jive.service.routes.oauth);
module.exports = myOauth;

myOauth.fetchOAuth2Conf = function() {
    // this sfdc oauth app config is specific to addon server, since sfdc definition
    // contains addon server url
    return jive.service.options['oauth2-sfdc'];
};

myOauth.oauth2SuccessCallback = function( state, originServerAccessTokenResponse, callback ) {
    var content = originServerAccessTokenResponse['entity'];

    tokenStore.save('tokens', state['viewerID'], {
        ticket : state['viewerID'],
        accessToken: content['access_token'],
        refreshToken: content['refresh_token'],
        instanceUrl: content['instance_url']
    })
    .then( function() {
        callback({'ticket': state['viewerID'] });
    });
};

myOauth.getTokenStore = function() {
    return tokenStore;
};

myOauth.refreshToken = function( tokenData, viewerID ) {
    return oauthUtil.refreshTokenFlow( myOauth.fetchOAuth2Conf(), tokenData.refreshToken)
    .then( function (response) {
        var content = response['entity'];
        // todo error response check?

        // note that response does NOT contain the refresh token so we only
        // update the changed fields in token data before saving
        tokenData.accessToken = content['access_token'];
        tokenData.instanceUrl = content['instance_url'];
        return tokenStore.save('tokens', viewerID, tokenData);
    });
};
