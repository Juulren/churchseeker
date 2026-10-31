using Microsoft.AspNetCore.Identity;

namespace ChurchSeeker.Infrastructure.Identity;

public class ApplicationUser : IdentityUser<Guid>
{
    public Guid ChurchId { get; set; }
    public string FullName { get; set; } = string.Empty;
    // Soft delete: deactivated users cannot log in or refresh.
    public bool IsActive { get; set; } = true;
}
