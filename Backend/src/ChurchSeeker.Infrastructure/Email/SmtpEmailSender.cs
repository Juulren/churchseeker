using System.Net;
using ChurchSeeker.Application.Auth;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace ChurchSeeker.Infrastructure.Email;

/// <summary>Sends the password-reset link through a real SMTP server. The token is never logged.</summary>
public sealed class SmtpEmailSender : IEmailSender
{
    private readonly EmailOptions _opt;
    private readonly ILogger<SmtpEmailSender> _log;

    public SmtpEmailSender(IOptions<EmailOptions> options, ILogger<SmtpEmailSender> log)
    {
        _opt = options.Value;
        _log = log;
    }

    public static string BuildLink(string baseUrl, string email, string token) =>
        $"{baseUrl.TrimEnd('/')}/#/reset?email={Uri.EscapeDataString(email)}&token={Uri.EscapeDataString(token)}";

    public async Task SendPasswordResetAsync(string email, string resetToken, CancellationToken ct = default)
    {
        var link = BuildLink(_opt.ResetBaseUrl, email, resetToken);
        var message = new MimeMessage();
        message.From.Add(MailboxAddress.Parse(_opt.From));
        message.To.Add(MailboxAddress.Parse(email));
        message.Subject = "Restablece tu contraseña de ChurchSeeker";
        var builder = new BodyBuilder
        {
            TextBody = $"Recibimos una solicitud para restablecer tu contraseña.\n\nAbre este enlace (vence en 30 minutos y solo funciona una vez):\n{link}\n\nSi no fuiste tú, ignora este correo.",
            HtmlBody = $"<p>Recibimos una solicitud para restablecer tu contraseña.</p><p><a href=\"{WebUtility.HtmlEncode(link)}\">Crear una contraseña nueva</a></p><p>El enlace vence en 30 minutos y solo funciona una vez. Si no fuiste tú, ignora este correo.</p>"
        };
        message.Body = builder.ToMessageBody();

        try
        {
            using var client = new SmtpClient();
            await client.ConnectAsync(_opt.Host, _opt.Port, _opt.UseSsl ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTlsWhenAvailable, ct);
            if (!string.IsNullOrEmpty(_opt.User)) await client.AuthenticateAsync(_opt.User, _opt.Password, ct);
            await client.SendAsync(message, ct);
            await client.DisconnectAsync(true, ct);
        }
        catch (Exception ex)
        {
            // Never surface the failure to the caller: the endpoint must answer the same for every email.
            _log.LogError(ex, "Could not send the password reset email.");
        }
    }
}
