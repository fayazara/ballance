// Read-only geometry probe linked against the separately installed IVP reference.
// Input: case-name, hull-count, then point-count and xyz triples for each hull.
// Output: one JSON measurement per case; no game executable is loaded.
#include <ivp_physics.hxx>
#include <ivp_surbuild_pointsoup.hxx>
#include <ivp_surbuild_ledge_soup.hxx>
#include <ivp_compact_surface.hxx>
#include <ivp_compact_ledge.hxx>
#include <ivp_compact_ledge_solver.hxx>
#include <ivp_rot_inertia_solver.hxx>
#include <iostream>
#include <iomanip>
#include <string>
#include <vector>

int main() {
    std::string name;
    int hullCount;
    while (std::cin >> name >> hullCount) {
        if (hullCount < 1 || hullCount > 1000) return 2;
        IVP_SurfaceBuilder_Ledge_Soup builder;
        for (int h = 0; h < hullCount; ++h) {
            int count; std::cin >> count;
            if (count < 4 || count > 100000) return 3;
            std::vector<IVP_U_Point> storage(count);
            IVP_U_Vector<IVP_U_Point> points(count);
            for (int i = 0; i < count; ++i) {
                double x, y, z;
                if (!(std::cin >> x >> y >> z)) return 4;
                storage[i].set(x, y, z); points.add(&storage[i]);
            }
            IVP_Compact_Ledge *ledge = IVP_SurfaceBuilder_Pointsoup::convert_pointsoup_to_compact_ledge(&points);
            if (!ledge) return 5;
            builder.insert_ledge(ledge);
        }
        IVP_Compact_Surface *surface = builder.compile();
        if (!surface) return 6;
        IVP_U_BigVector<IVP_Compact_Ledge> ledges(128);
        IVP_Compact_Ledge_Solver::get_all_ledges(surface, &ledges);
        IVP_U_Matrix transform; transform.init();
        transform.vv.set(surface->mass_center.k);
        double moments[3];
        for (int axis = 0; axis < 3; ++axis) {
            double center, volume;
            IVP_Rot_Inertia_Solver::find_center_given_xyz(&ledges, axis, (axis+1)%3, (axis+2)%3,
                &transform, &center, &volume, &moments[axis]);
        }
        std::cout << std::setprecision(10) << "{\"name\":\"" << name << "\",\"center\":["
            << surface->mass_center.k[0] << ',' << surface->mass_center.k[1] << ',' << surface->mass_center.k[2]
            << "],\"inertiaPerMass\":[" << surface->rotation_inertia.k[0] << ',' << surface->rotation_inertia.k[1] << ',' << surface->rotation_inertia.k[2]
            << "],\"secondMoments\":[" << moments[0] << ',' << moments[1] << ',' << moments[2] << "]}" << std::endl;
        ivp_free_aligned(surface);
    }
}
