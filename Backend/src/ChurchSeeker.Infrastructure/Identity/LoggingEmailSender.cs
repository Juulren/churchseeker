using ChurchSeeker.Application.Auth;
using Microsoft.Extensions.Logging;

namespace ChurchSeeker.Infrastructure.Identity;

// Development stand-in until a real SMTP sender exists. The token is logged at Debug only.
public sealed class LoggingEmailSender : IEmailSender
{
    private readonly ILogger<LoggingEmailSender> _log;

    public LoggingEmailSender(ILogger<LoggingEmailSender> log) => _log = log;

    public Task SendPasswordResetAsync(string email, string resetToken, CancellationToken ct = default)
    {
        _log.LogInformation("Password reset requested for a user.");
        _log.LogDebug("Reset token for {Email}: {Token}", email, resetToken);
        return Task.CompletedTask;
    }
}
