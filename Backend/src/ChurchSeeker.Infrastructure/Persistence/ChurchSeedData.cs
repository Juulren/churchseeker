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

    public const string CathedralHistory =
        "La Catedral de San Ildefonso es la sede de la Arquidiócesis de Yucatán y se la considera de las primeras catedrales construidas en tierra firme americana. Sus obras comenzaron hacia 1562, sobre una capilla de San José, y se dieron por concluidas en 1598.\n\n" +
        "El proyecto fue encomendado a Pedro de Aulestia y lo completaron Juan Miguel de Agüero y Gregorio de la Torre. Es de cantera, con una fachada renacentista y torres de aire morisco. En 1915 sufrió saqueos durante la entrada de fuerzas revolucionarias a la ciudad.";

    public const string JesusHistory =
        "La Iglesia de Jesús, conocida como la Tercera Orden, la levantó la Compañía de Jesús a partir de 1618 como parte de un colegio que ocupaba toda la manzana; hoy es el único edificio que sobrevive de aquel conjunto.\n\n" +
        "Tras la expulsión de los jesuitas, en 1767, pasó a la Tercera Orden franciscana, de la que toma su nombre popular. Su planta es de cruz latina, con bóvedas de cañón y cúpulas sin tambor.";

    public const string SantaLuciaHistory =
        "La Iglesia de Santa Lucía nació como una capilla para dar servicio religioso a los vecinos del barrio, poco después de la fundación de Mérida en 1542. Según una de las fuentes, su construcción se concluyó hacia 1575, y alcanzó su tamaño actual hacia 1760. Tiene una entrada rectangular enmarcada en cantera, un vitral y una espadaña.\n\n" +
        "En 1804 el gobernador Benito Pérez Valdelomar convirtió en plaza el terreno del actual parque, que era un basurero. Desde 1965 el Parque de Santa Lucía ofrece serenatas yucatecas los jueves.";

    public static IReadOnlyList<Church> Churches() =>
    [
        Seed(new(CathedralId, "Catedral de San Ildefonso", "Católica", "San Ildefonso de Toledo",
            "Calle 60 s/n, Centro, Mérida, Yucatán", 20.9671, -89.6225, CathedralHistory)),
        Seed(new(SantaLuciaId, "Iglesia de Santa Lucía", "Católica", "Santa Lucía",
            "Calle 60 x 55, Santa Lucía, Mérida, Yucatán", 20.97160, -89.62480, SantaLuciaHistory)),
        Seed(new(JesusId, "Iglesia de Jesús (Tercera Orden)", "Católica", "Jesús Nazareno",
            "Calle 60 x 57, Centro, Mérida, Yucatán", 20.96610, -89.62340, JesusHistory))
    ];
}
