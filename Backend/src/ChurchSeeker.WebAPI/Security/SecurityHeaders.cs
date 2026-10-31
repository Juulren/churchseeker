namespace ChurchSeeker.WebAPI.Security;

public static class SecurityHeaders
{
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app, bool allowSwagger)
    {
        return app.Use(async (ctx, next) =>
        {
            ctx.Response.OnStarting(() =>
            {
                var h = ctx.Response.Headers;
                h["X-Content-Type-Options"] = "nosniff";
                h["X-Frame-Options"] = "DENY";
                h["Referrer-Policy"] = "no-referrer";
                h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
                h["Cross-Origin-Resource-Policy"] = "same-site";
                // This is a JSON API: nothing should ever be rendered or framed from it.
                if (!(allowSwagger && ctx.Request.Path.StartsWithSegments("/swagger")))
                    h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
                if (ctx.Request.Path.StartsWithSegments("/api"))
                    h["Cache-Control"] = "no-store";
                return Task.CompletedTask;
            });
            await next();
        });
    }
}
