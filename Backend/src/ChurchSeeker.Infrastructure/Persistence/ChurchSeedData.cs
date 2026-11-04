using ChurchSeeker.Domain.Entities;

namespace ChurchSeeker.Infrastructure.Persistence;

// Pilot churches in Merida, Yucatan. Coordinates are approximate: verify before production.
public static class ChurchSeedData
{
    public static readonly Guid CathedralId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid SantaLuciaId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    public static readonly Guid JesusId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    // A fixed moment (not "now"), so the seed never changes between migrations.
    private static readonly DateTime SeedTime = new(2026, 11, 3, 5, 22, 57, 830, DateTimeKind.Utc);

    private static Church Seed(Church c) { c.AtSeedTime(SeedTime); return c; }

    public static IReadOnlyList<Church> Churches() =>
    [
        Seed(new(CathedralId, "Catedral de San Ildefonso", "Católica", "San Ildefonso de Toledo",
            "Calle 60 s/n, Centro, Mérida, Yucatán", 20.9671, -89.6225)),
        Seed(new(SantaLuciaId, "Iglesia de Santa Lucía", "Católica", "Santa Lucía",
            "Calle 60 x 55, Santa Lucía, Mérida, Yucatán", 20.97160, -89.62480)),
        Seed(new(JesusId, "Iglesia de Jesús (Tercera Orden)", "Católica", "Jesús Nazareno",
            "Calle 60 x 57, Centro, Mérida, Yucatán", 20.96610, -89.62340))
    ];
}
