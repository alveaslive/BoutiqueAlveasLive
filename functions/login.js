// Démarre la connexion Twitch : redirige le viewer vers la page d'autorisation Twitch.
export function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const redirectUri = url.origin + "/auth";

  const authUrl =
    "https://id.twitch.tv/oauth2/authorize" +
    "?client_id=" + encodeURIComponent(env.TWITCH_CLIENT_ID) +
    "&redirect_uri=" + encodeURIComponent(redirectUri) +
    "&response_type=code" +
    "&scope=" + encodeURIComponent("user:read:email");

  return Response.redirect(authUrl, 302);
}
