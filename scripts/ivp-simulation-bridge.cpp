// Project-owned experimental bridge to a separately installed IVP SDK reference.
// No game executable is loaded. Units and handedness here are IVP's originals.
// Descriptor (18 doubles): xyz, quaternion xyzw, mass, friction, elasticity,
// linear damping, angular damping, fixed, COM xyz, collision enabled, frozen.
#include <ivp_physics.hxx>
#include <ivp_environment.hxx>
#include <ivp_templates.hxx>
#include <ivp_material.hxx>
#include <ivp_ball.hxx>
#include <ivp_polygon.hxx>
#include <ivp_core.hxx>
#include <ivp_collision_filter.hxx>
#include <ivp_surbuild_pointsoup.hxx>
#include <ivp_surbuild_ledge_soup.hxx>
#include <ivp_surman_polygon.hxx>
#include <ivp_compact_surface.hxx>
#include <ivp_template_constraint.hxx>
#include <ivp_constraint.hxx>
#include <ivp_controller_factory.hxx>
#include <ivp_actuator_spring.hxx>
#include <ivp_listener_collision.hxx>
#include <vector>
#include <memory>
#include <cmath>
#include <algorithm>
#include <map>
#include <array>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define BRIDGE_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define BRIDGE_EXPORT
#include <iostream>
#include <iomanip>
#include <string>
#endif

// Adapted from CKBuildingBlocks PhysicsForce.cpp (Apache-2.0), see THIRD_PARTY.md.
// The original "force" is a captured world impulse applied once per PSI, with
// its application point stored in core axes. It is intentionally NOT multiplied
// by the timestep and does not re-resolve the direction's referential each tick.
class OriginalForce final : public IVP_Controller_Independent {
    IVP_Core *core;
    IVP_U_Point point,impulse;
public:
    OriginalForce(IVP_Real_Object *body,const IVP_U_Point &p,const IVP_U_Point &f):core(body->get_core()),point(p),impulse(f) {
        IVP_Controller_Manager::add_controller_to_core(this,core);
    }
    ~OriginalForce() { if(core) IVP_Controller_Manager::remove_controller_from_core(this,core); }
    void core_is_going_to_be_deleted_event(IVP_Core *deleted) override {
        if(core==deleted) {core->rem_core_controller(this);core=nullptr;}
    }
    void do_simulation_controller(IVP_Event_Sim *,IVP_U_Vector<IVP_Core> *cores) override {
        if(!core || !cores || !cores->len()) return;
        IVP_U_Matrix matrix;core->calc_at_matrix(core->get_environment()->get_current_time(),&matrix);
        IVP_U_Point local;matrix.vimult3(&impulse,&local);
        IVP_U_Float_Point p(point.k[0],point.k[1],point.k[2]);
        IVP_U_Float_Point f(local.k[0],local.k[1],local.k[2]),world(impulse.k[0],impulse.k[1],impulse.k[2]);
        core->async_push_core(&p,&f,&world);
    }
    IVP_CONTROLLER_PRIORITY get_controller_priority() override {return IVP_CP_ACTUATOR;}
};

struct Simulation : public IVP_Listener_Collision {
    struct Contact { int id; int a; int b; };
    std::map<IVP_Contact_Point *,Contact> contacts;
    std::vector<std::array<double,14>> events;
    int next_contact=1;
    struct Joint { IVP_Constraint *constraint; int reference; int attached; };
    struct Spring { IVP_Actuator_Spring *spring; int reference; int attached; };
    struct Force { OriginalForce *controller; int body; };
    IVP_Environment *environment;
    IVP_Collision_Filter_Exclusive_Pair *pair_filter;
    std::vector<std::pair<int,int>> excluded_pairs;
    std::vector<IVP_Real_Object *> objects;
    std::vector<Joint> joints;
    std::vector<Spring> springs;
    std::vector<Force> forces;
    std::vector<std::unique_ptr<IVP_Material_Simple>> materials;
    std::vector<std::unique_ptr<IVP_SurfaceManager_Polygon>> managers;
    std::vector<IVP_Compact_Surface *> surfaces;
    explicit Simulation(double gravity):IVP_Listener_Collision(IVP_LISTENER_COLLISION_CALLBACK_FRICTION|IVP_LISTENER_COLLISION_CALLBACK_POST_COLLISION) {
        IVP_Application_Environment config;
        auto *filters=new IVP_Meta_Collision_Filter(IVP_TRUE);
        pair_filter=new IVP_Collision_Filter_Exclusive_Pair;
        filters->add_collision_filter(pair_filter);
        filters->add_collision_filter(new IVP_Collision_Filter_Coll_Group_Ident(IVP_TRUE));
        config.collision_filter=filters;
        environment = IVP_Environment_Manager::get_environment_manager()->create_environment(&config, "Ballance web physics audit", 0);
        IVP_U_Point acceleration; acceleration.set(0, gravity, 0);
        environment->set_gravity(&acceleration);
        environment->set_delta_PSI_time(1.0 / 66.0);
        environment->add_listener_collision_global(this);
    }
    static int body_id(IVP_Real_Object *body) {return static_cast<int>(reinterpret_cast<uintptr_t>(body->client_data));}
    void record(int kind,int contact,IVP_Contact_Situation *situation,bool full) {
        std::array<double,14> row{};
        row[0]=kind;row[1]=environment->get_current_time().get_time();row[2]=contact;
        row[3]=body_id(situation->objects[0]);row[4]=body_id(situation->objects[1]);
        if(full) for(int axis=0;axis<3;++axis) {
            row[5+axis]=situation->surf_normal.k[axis];row[8+axis]=situation->contact_point_ws.k[axis];
            // Friction creation does not initialize the relative-speed field.
            if(kind==3) row[11+axis]=situation->speed.k[axis];
        }
        events.push_back(row);
    }
    void event_friction_created(IVP_Event_Friction *event) override {
        auto *situation=event->contact_situation;
        Contact contact{next_contact++,body_id(situation->objects[0]),body_id(situation->objects[1])};
        contacts[event->friction_handle]=contact;record(1,contact.id,situation,true);
    }
    void event_friction_deleted(IVP_Event_Friction *event) override {
        auto found=contacts.find(event->friction_handle);if(found==contacts.end()) return;
        record(2,found->second.id,event->contact_situation,false);contacts.erase(found);
    }
    // The original manager subscribes after impact resolution. The pre-impact
    // callback runs before IVP initializes the relative-speed field.
    void event_post_collision(IVP_Event_Collision *event) override {record(3,0,event->contact_situation,true);}
    ~Simulation() {
        environment->remove_listener_collision_global(this);
        for(auto &force:forces) delete force.controller;
        for(auto &spring:springs) delete spring.spring;
        for(auto &joint:joints) delete joint.constraint;
        delete environment;
        managers.clear();
        for (auto surface : surfaces) ivp_free_aligned(surface);
    }
};

static bool valid_descriptor(const double *d) {
    if (!d) return false;
    for (int i = 0; i < 18; ++i) if (!std::isfinite(d[i])) return false;
    const double norm = d[3]*d[3] + d[4]*d[4] + d[5]*d[5] + d[6]*d[6];
    return norm > .999 && norm < 1.001 && d[7] > 0 && d[8] >= 0 && d[9] >= 0 && d[9] <= 1 && d[10] >= 0 && d[11] >= 0;
}

static int add_object(Simulation *s, const double *d, double radius, IVP_SurfaceManager_Polygon *surface, const char *group) {
    IVP_Template_Real_Object object;
    object.mass = d[7]; object.physical_unmoveable = d[12] ? IVP_TRUE : IVP_FALSE;
    object.speed_damp_factor = d[10]; object.rot_speed_damp_factor.set(d[11], d[11], d[11]);
    object.set_nocoll_group_ident(group ? group : "");
    auto material = std::make_unique<IVP_Material_Simple>(d[8], d[9]);
    object.material = material.get();
    IVP_U_Matrix center; center.init(); center.vv.set(d[13],d[14],d[15]);
    object.mass_center_override = &center;
    IVP_U_Point position; position.set(d[0],d[1],d[2]);
    IVP_U_Quat rotation; rotation.x=d[3]; rotation.y=d[4]; rotation.z=d[5]; rotation.w=d[6];
    IVP_Real_Object *body;
    if (surface) body = s->environment->create_polygon(surface, &object, &rotation, &position);
    else {
        IVP_Template_Ball ball; ball.radius = radius;
        body = s->environment->create_ball(&ball, &object, &rotation, &position);
    }
    if (!body) return 0;
    s->materials.push_back(std::move(material)); s->objects.push_back(body);
    body->client_data=reinterpret_cast<void *>(static_cast<uintptr_t>(s->objects.size()));
    body->enable_collision_detection(d[16] ? IVP_TRUE : IVP_FALSE);
    if (!d[12] && !d[17]) body->ensure_in_simulation();
    return static_cast<int>(s->objects.size());
}

static int finish_surface(Simulation *s, IVP_SurfaceBuilder_Ledge_Soup &builder, const double *d, const char *group) {
    IVP_Compact_Surface *surface = builder.compile();
    if (!surface) return 0;
    s->surfaces.push_back(surface);
    s->managers.push_back(std::make_unique<IVP_SurfaceManager_Polygon>(surface));
    return add_object(s,d,0,s->managers.back().get(),group);
}

static IVP_Real_Object *get_object(Simulation *s, int id) {
    return s && id > 0 && id <= static_cast<int>(s->objects.size()) ? s->objects[id-1] : nullptr;
}

static bool insert_convex(IVP_SurfaceBuilder_Ledge_Soup &builder, int count, const double *vertices) {
    std::vector<IVP_U_Point> storage(count); IVP_U_Vector<IVP_U_Point> points(count);
    for(int i=0;i<count;++i) {
        const double *p=vertices+i*3; storage[i].set(p[0],p[1],p[2]); points.add(&storage[i]);
    }
    auto *ledge=IVP_SurfaceBuilder_Pointsoup::convert_pointsoup_to_compact_ledge(&points);
    if(!ledge) return false;
    builder.insert_ledge(ledge); return true;
}

extern "C" {
BRIDGE_EXPORT int ivp_bridge_abi() { return 7; }
BRIDGE_EXPORT Simulation *ivp_new(double gravity) { return std::isfinite(gravity) ? new Simulation(gravity) : nullptr; }
BRIDGE_EXPORT void ivp_delete(Simulation *s) { delete s; }
BRIDGE_EXPORT double ivp_time(Simulation *s) {return s?s->environment->get_current_time().get_time():NAN;}
BRIDGE_EXPORT int ivp_event_count(Simulation *s) {return s?static_cast<int>(s->events.size()):-1;}
BRIDGE_EXPORT int ivp_events(Simulation *s,double *out,int capacity) {
    if(!s || capacity<static_cast<int>(s->events.size()) || (!out && !s->events.empty())) return -1;
    const int count=static_cast<int>(s->events.size());
    for(int i=0;i<count;++i) std::copy(s->events[i].begin(),s->events[i].end(),out+i*14);
    s->events.clear();return count;
}
// Active friction contacts: id, original object order, current normal toward B,
// and normal force. No invalid deleted-contact geometry is read.
BRIDGE_EXPORT int ivp_contacts(Simulation *s,int id,double *out,int capacity) {
    if(!get_object(s,id) || capacity<0) return -1;
    std::vector<std::pair<IVP_Contact_Point *,Simulation::Contact>> matches;
    for(auto &entry:s->contacts) if(entry.second.a==id || entry.second.b==id) matches.push_back(entry);
    std::sort(matches.begin(),matches.end(),[](const auto &a,const auto &b){return a.second.id<b.second.id;});
    if(!out) return static_cast<int>(matches.size());
    if(capacity<static_cast<int>(matches.size())) return -1;
    for(size_t i=0;i<matches.size();++i) {
        auto &entry=matches[i];double *row=out+i*7;
        row[0]=entry.second.id;row[1]=entry.second.a;row[2]=entry.second.b;
        IVP_U_Float_Point normal;IVP_Contact_Point_API::get_surface_normal_ws(entry.first,&normal);
        for(int axis=0;axis<3;++axis) row[3+axis]=normal.k[axis];
        row[6]=IVP_Contact_Point_API::get_vert_force(entry.first);
    }
    return static_cast<int>(matches.size());
}
BRIDGE_EXPORT int ivp_ball(Simulation *s, double radius, const double *d, const char *group=nullptr) {
    if (!s || !valid_descriptor(d) || !std::isfinite(radius) || radius <= 0 || (group && strlen(group)>=IVP_NO_COLL_GROUP_STRING_LEN)) return 0;
    return add_object(s,d,radius,nullptr,group);
}
BRIDGE_EXPORT int ivp_hull(Simulation *s, int count, const double *vertices, const double *d, const char *group=nullptr) {
    if (!s || !valid_descriptor(d) || !vertices || count < 4 || count > 100000 || (group && strlen(group)>=IVP_NO_COLL_GROUP_STRING_LEN)) return 0;
    for(int i=0;i<count*3;++i) if(!std::isfinite(vertices[i])) return 0;
    IVP_SurfaceBuilder_Ledge_Soup builder;
    if(!insert_convex(builder,count,vertices)) return 0;
    return finish_surface(s,builder,d,group);
}
// Packed as point-count, xyz triples, point-count, xyz triples... . Each hull
// becomes a separate ledge, while the complete soup becomes ONE physical body.
BRIDGE_EXPORT int ivp_compound(Simulation *s, int hull_count, int length, const double *packed, const double *d, const char *group) {
    if(!s || !valid_descriptor(d) || !packed || hull_count<1 || hull_count>1000 || length<13 || length>3001000 || (group && strlen(group)>=IVP_NO_COLL_GROUP_STRING_LEN)) return 0;
    int offset=0;
    for(int hull=0;hull<hull_count;++hull) {
        if(offset>=length || !std::isfinite(packed[offset]) || packed[offset]<4 || packed[offset]>100000 || std::floor(packed[offset])!=packed[offset]) return 0;
        const int count=static_cast<int>(packed[offset++]);
        if(count*3>length-offset) return 0;
        for(int i=0;i<count*3;++i) if(!std::isfinite(packed[offset+i])) return 0;
        offset+=count*3;
    }
    if(offset!=length) return 0;
    IVP_SurfaceBuilder_Ledge_Soup builder; offset=0;
    for(int hull=0;hull<hull_count;++hull) {
        const int count=static_cast<int>(packed[offset++]);
        if(!insert_convex(builder,count,packed+offset)) return 0;
        offset+=count*3;
    }
    return finish_surface(s,builder,d,group);
}
// CKIpionManager::AddConcaveSurface builds one three-point ledge per face,
// preserving face order, then compiles the complete mesh into one surface.
BRIDGE_EXPORT int ivp_trimesh(Simulation *s, int face_count, const double *triangles, const double *d, const char *group=nullptr) {
    if (!s || !valid_descriptor(d) || !triangles || face_count < 1 || face_count > 1000000 || (group && strlen(group)>=IVP_NO_COLL_GROUP_STRING_LEN)) return 0;
    for (int i=0;i<face_count*9;++i) if(!std::isfinite(triangles[i])) return 0;
    IVP_SurfaceBuilder_Ledge_Soup builder;
    IVP_U_Point storage[3]; IVP_U_Vector<IVP_U_Point> points(3);
    for (int i=0;i<3;++i) points.add(&storage[i]);
    int accepted=0;
    for (int face=0;face<face_count;++face) {
        for(int i=0;i<3;++i) {
            const double *p=triangles+face*9+i*3; storage[i].set(p[0],p[1],p[2]);
        }
        auto *ledge=IVP_SurfaceBuilder_Pointsoup::convert_pointsoup_to_compact_ledge(&points);
        if(ledge) { builder.insert_ledge(ledge); ++accepted; }
    }
    return accepted ? finish_surface(s,builder,d,group) : 0;
}
BRIDGE_EXPORT int ivp_group(Simulation *s, int id, const char *group) {
    auto *body=get_object(s,id);
    if(!body || !group || strlen(group) >= IVP_NO_COLL_GROUP_STRING_LEN) return 0;
    body->change_nocoll_group_ident(group); body->recheck_collision_filter(); return 1;
}
BRIDGE_EXPORT int ivp_remove(Simulation *s, int id) {
    auto *body=get_object(s,id); if(!body) return 0;
    for(auto it=s->excluded_pairs.begin();it!=s->excluded_pairs.end();) {
        if(it->first==id || it->second==id) {
            s->pair_filter->enable_collision_between_objects(get_object(s,it->first),get_object(s,it->second));
            it=s->excluded_pairs.erase(it);
        } else ++it;
    }
    for(auto &force:s->forces) if(force.controller && force.body==id) {
        delete force.controller;force.controller=nullptr;
    }
    for(auto &spring:s->springs) if(spring.spring && (spring.reference==id || spring.attached==id)) {
        delete spring.spring;spring.spring=nullptr;
    }
    // IVP deletes a connected constraint with its core. Release it here first
    // so the public joint handle cannot retain that automatically freed pointer.
    for(auto &joint:s->joints) if(joint.constraint && (joint.reference==id || joint.attached==id)) {
        delete joint.constraint; joint.constraint=nullptr;
    }
    body->delete_silently(); s->objects[id-1]=nullptr; return 1;
}
BRIDGE_EXPORT int ivp_pair(Simulation *s,int first,int second,int enabled) {
    auto *a=get_object(s,first),*b=get_object(s,second);
    if(!a || !b || a==b) return 0;
    const std::pair<int,int> pair=first<second?std::make_pair(first,second):std::make_pair(second,first);
    auto found=std::find(s->excluded_pairs.begin(),s->excluded_pairs.end(),pair);
    if(enabled) {
        s->pair_filter->enable_collision_between_objects(a,b);
        if(found!=s->excluded_pairs.end()) s->excluded_pairs.erase(found);
    } else {
        s->pair_filter->disable_collision_between_objects(a,b);
        if(found==s->excluded_pairs.end()) s->excluded_pairs.push_back(pair);
    }
    a->recheck_collision_filter();b->recheck_collision_filter();return 1;
}
// kind: 1 hinge, 2 slider, 3 ball socket. Nine doubles: world anchor xyz,
// world axis xyz, limits enabled, lower, upper. Hinge bounds are radians.
BRIDGE_EXPORT int ivp_joint(Simulation *s,int kind,int reference,int attached,const double *d) {
    if(!s || !d || kind<1 || kind>3 || reference==attached) return 0;
    auto *r=get_object(s,reference), *a=get_object(s,attached);
    if((reference!=0 && !r) || (attached!=0 && !a)) return 0;
    if((!r || r->get_core()->physical_unmoveable) && (!a || a->get_core()->physical_unmoveable)) return 0;
    for(int i=0;i<9;++i) if(!std::isfinite(d[i])) return 0;
    if(kind!=3 && d[3]*d[3]+d[4]*d[4]+d[5]*d[5]<1e-16) return 0;
    if(d[6] && (kind==3 || d[7]>d[8])) return 0;
    IVP_U_Point anchor; anchor.set(d[0],d[1],d[2]);
    IVP_U_Point axis; axis.set(d[3],d[4],d[5]);
    IVP_Template_Constraint tmpl;
    if(kind==1) {
        tmpl.set_hinge_ws(r,&anchor,&axis,a);
        if(d[6]) tmpl.limit_rotation_axis(IVP_INDEX_Z,d[7],d[8]);
    } else if(kind==2) {
        // Preserve both calls in the recovered SetPhysicsSlider callback.
        tmpl.set_constraint_ws(r,&anchor,&axis,3,2,a,nullptr);
        tmpl.set_constraint_ws(r,&anchor,&axis,2,3,a,nullptr);
        if(d[6]) tmpl.limit_translation_axis(IVP_INDEX_Z,d[7],d[8]);
    } else tmpl.set_ballsocket_ws(r,&anchor,a);
    auto *constraint=IVP_Controller_Factory::create_constraint(s->environment,&tmpl);
    if(!constraint) return 0;
    s->joints.push_back({constraint,reference,attached});
    return static_cast<int>(s->joints.size());
}
BRIDGE_EXPORT int ivp_remove_joint(Simulation *s,int id) {
    if(!s || id<1 || id>static_cast<int>(s->joints.size()) || !s->joints[id-1].constraint) return 0;
    delete s->joints[id-1].constraint; s->joints[id-1].constraint=nullptr; return 1;
}
BRIDGE_EXPORT int ivp_wake(Simulation *s,int id) {
    auto *body=get_object(s,id); if(!body) return 0;
    body->ensure_in_simulation(); return 1;
}
// Ten doubles: two world-space anchors, rest length, constant, axial damping,
// global damping. Original SetPhysicsSpring uses absolute, bidirectional values.
BRIDGE_EXPORT int ivp_spring(Simulation *s,int reference,int attached,const double *d) {
    auto *r=get_object(s,reference),*a=get_object(s,attached);
    if(!r || !a || r==a || !d) return 0;
    if(r->get_core()->physical_unmoveable && a->get_core()->physical_unmoveable) return 0;
    for(int i=0;i<10;++i) if(!std::isfinite(d[i]) || (i>=6 && d[i]<0)) return 0;
    IVP_U_Point p1,p2;p1.set(d[0],d[1],d[2]);p2.set(d[3],d[4],d[5]);
    IVP_Template_Anchor a1,a2;a1.set_anchor_position_ws(r,&p1);a2.set_anchor_position_ws(a,&p2);
    IVP_Template_Spring tmpl;tmpl.anchors[0]=&a1;tmpl.anchors[1]=&a2;
    tmpl.spring_values_are_relative=IVP_FALSE;tmpl.spring_force_only_on_stretch=IVP_FALSE;
    tmpl.spring_len=d[6];tmpl.spring_constant=d[7];tmpl.spring_damp=d[8];tmpl.rel_pos_damp=d[9];
    auto *spring=IVP_Controller_Factory::create_spring(s->environment,&tmpl);
    if(!spring) return 0;
    s->springs.push_back({spring,reference,attached});return static_cast<int>(s->springs.size());
}
BRIDGE_EXPORT int ivp_remove_spring(Simulation *s,int id) {
    if(!s || id<1 || id>static_cast<int>(s->springs.size()) || !s->springs[id-1].spring) return 0;
    delete s->springs[id-1].spring;s->springs[id-1].spring=nullptr;return 1;
}
// Seven doubles: application point, world direction captured at creation, value.
// core_point is the original position-referential==target shortcut; otherwise
// the resolved world point is transformed to core space at creation.
BRIDGE_EXPORT int ivp_force(Simulation *s,int id,int core_point,const double *d) {
    auto *body=get_object(s,id);if(!body || !d || body->get_core()->physical_unmoveable) return 0;
    for(int i=0;i<7;++i) if(!std::isfinite(d[i])) return 0;
    IVP_U_Point point,force;point.set(d[0],d[1],d[2]);force.set(d[3],d[4],d[5]);
    if(force.quad_length()<=.0001) force.set(1,0,0);else force.normize();
    force.mult(d[6]);
    if(!core_point) {
        IVP_U_Matrix matrix;body->get_core()->calc_at_matrix(s->environment->get_current_time(),&matrix);
        IVP_U_Point local;matrix.vimult4(&point,&local);point=local;
    }
    s->forces.push_back({new OriginalForce(body,point,force),id});return static_cast<int>(s->forces.size());
}
BRIDGE_EXPORT int ivp_remove_force(Simulation *s,int id) {
    if(!s || id<1 || id>static_cast<int>(s->forces.size()) || !s->forces[id-1].controller) return 0;
    delete s->forces[id-1].controller;s->forces[id-1].controller=nullptr;return 1;
}
BRIDGE_EXPORT int ivp_step(Simulation *s, double dt) {
    // CKTimeManager allows a 1000 ms script frame in Ballance. With the
    // original 2x physics factor, filtered simulation intervals can exceed
    // one second. simulate_dtime performs its own PSI stepping.
    if (!s || !std::isfinite(dt) || dt <= 0) return 0;
    s->environment->simulate_dtime(dt); return 1;
}
BRIDGE_EXPORT int ivp_push(Simulation *s, int id, double x, double y, double z) {
    auto *body=get_object(s,id);
    if (!body || !std::isfinite(x) || !std::isfinite(y) || !std::isfinite(z)) return 0;
    IVP_U_Point position; body->get_geom_center_world_space(&position);
    IVP_U_Float_Point impulse; impulse.set(x,y,z);
    body->async_push_object_ws(&position,&impulse); return 1;
}
BRIDGE_EXPORT int ivp_push_at(Simulation *s, int id, const double *values) {
    auto *body=get_object(s,id); if(!body || !values) return 0;
    for(int i=0;i<6;++i) if(!std::isfinite(values[i])) return 0;
    IVP_U_Point position; position.set(values[0],values[1],values[2]);
    IVP_U_Float_Point impulse; impulse.set(values[3],values[4],values[5]);
    body->async_push_object_ws(&position,&impulse); return 1;
}
// Output (17 doubles): xyz, quaternion xyzw, velocity xyz, core angular velocity
// xyz, core inertia xyz, movement-state enum. Pose is the native AT interpolation.
BRIDGE_EXPORT int ivp_state(Simulation *s, int id, double *out) {
    auto *body=get_object(s,id); if(!body || !out) return 0;
    auto *core = body->get_core();
    IVP_U_Point position; IVP_U_Quat rotation;
    body->get_quat_world_f_object_AT(&rotation,&position);
    for (int i=0;i<3;++i) {
        out[i]=position.k[i]; out[7+i]=core->speed.k[i];
        out[10+i]=core->rot_speed.k[i]; out[13+i]=core->get_rot_inertia()->k[i];
    }
    out[3]=rotation.x; out[4]=rotation.y; out[5]=rotation.z; out[6]=rotation.w;
    out[16]=body->get_movement_state(); return 1;
}
}

#ifndef __EMSCRIPTEN__
// Text protocol used only by the native/WASM trajectory comparison runner.
int main() {
    std::unique_ptr<Simulation> world; std::string command;
    while (std::cin >> command) {
        std::string creation_group;
        if(command=="ballg" || command=="hullg" || command=="trimeshg" || command=="compoundg") {
            std::cin>>creation_group; command.pop_back();
            if(creation_group=="_") creation_group.clear();
        }
        if (command == "world") { double g; std::cin >> g; world.reset(); world.reset(ivp_new(g)); }
        else if(command=="events" || command=="contacts") {
            int id=0,count,width=command=="events"?14:7;
            if(command=="contacts") std::cin>>id;
            count=width==14?ivp_event_count(world.get()):ivp_contacts(world.get(),id,nullptr,0);
            if(count<0) return 22;
            std::vector<double> rows(count*width);
            const int written=width==14?ivp_events(world.get(),rows.data(),count):ivp_contacts(world.get(),id,rows.data(),count);
            if(written!=count) return 23;
            std::cout<<std::setprecision(17)<<'[';
            for(int i=0;i<count;++i) {if(i) std::cout<<',';std::cout<<'[';for(int j=0;j<width;++j) {if(j) std::cout<<',';std::cout<<rows[i*width+j];}std::cout<<']';}
            std::cout<<']'<<std::endl;
        }
        else if(command=="joint") {
            int kind,reference,attached; double d[9]; std::cin>>kind>>reference>>attached;
            for(auto &v:d) std::cin>>v;
            if(!ivp_joint(world.get(),kind,reference,attached,d)) return 14;
        }
        else if(command=="remove_joint") {
            int id; std::cin>>id; if(!ivp_remove_joint(world.get(),id)) return 15;
        }
        else if(command=="wake") { int id; std::cin>>id; if(!ivp_wake(world.get(),id)) return 16; }
        else if(command=="pair") {int a,b,enabled;std::cin>>a>>b>>enabled;if(!ivp_pair(world.get(),a,b,enabled)) return 21;}
        else if(command=="spring") {
            int a,b;double d[10];std::cin>>a>>b;for(auto &v:d) std::cin>>v;
            if(!ivp_spring(world.get(),a,b,d)) return 17;
        }
        else if(command=="remove_spring") {int id;std::cin>>id;if(!ivp_remove_spring(world.get(),id)) return 18;}
        else if(command=="force") {
            int id,space;double d[7];std::cin>>id>>space;for(auto &v:d) std::cin>>v;
            if(!ivp_force(world.get(),id,space,d)) return 19;
        }
        else if(command=="remove_force") {int id;std::cin>>id;if(!ivp_remove_force(world.get(),id)) return 20;}
        else if(command=="compound") {
            int hulls; std::cin>>hulls; if(hulls<1 || hulls>1000) return 11;
            std::vector<double> packed;
            for(int i=0;i<hulls;++i) {
                int count; std::cin>>count; if(count<4 || count>100000 || packed.size()+count*3+1>3001000) return 12;
                packed.push_back(count);
                for(int p=0;p<count*3;++p) { double value; std::cin>>value; packed.push_back(value); }
            }
            double d[18]; for(auto &v:d) std::cin>>v;
            if(!std::cin || !ivp_compound(world.get(),hulls,static_cast<int>(packed.size()),packed.data(),d,creation_group.c_str())) return 13;
        }
        else if (command == "ball" || command == "hull" || command == "trimesh") {
            double radius=0; int count=0; std::vector<double> vertices;
            if (command == "ball") std::cin >> radius;
            else { std::cin >> count; if(count<1 || count>1000000) return 2; vertices.resize(count*(command=="trimesh"?9:3)); for(auto &v:vertices) std::cin>>v; }
            double d[18]; for(auto &v:d) std::cin>>v;
            if(!std::cin || !(command == "ball" ? ivp_ball(world.get(),radius,d,creation_group.c_str()) : command=="trimesh" ? ivp_trimesh(world.get(),count,vertices.data(),d,creation_group.c_str()) : ivp_hull(world.get(),count,vertices.data(),d,creation_group.c_str()))) return 3;
        }
        else if (command == "group") { int id; std::string group; std::cin>>id>>group; if(!ivp_group(world.get(),id,group=="_"?"":group.c_str())) return 9; }
        else if (command == "remove") { int id; std::cin>>id; if(!ivp_remove(world.get(),id)) return 10; }
        else if (command == "push") { int id; double x,y,z; std::cin>>id>>x>>y>>z; if(!ivp_push(world.get(),id,x,y,z)) return 4; }
        else if(command=="push_at") { int id; double values[6]; std::cin>>id; for(auto &v:values) std::cin>>v; if(!ivp_push_at(world.get(),id,values)) return 14; }
        else if (command == "step") { double dt; std::cin>>dt; if(!ivp_step(world.get(),dt)) return 5; }
        else if (command == "state") {
            int id; double values[17]; std::cin>>id; if(!ivp_state(world.get(),id,values)) return 6;
            std::cout<<std::setprecision(17)<<'[';
            for(int i=0;i<17;++i) std::cout<<(i?",":"")<<values[i];
            std::cout<<"]\n";
        }
        else return 7;
        if(!std::cin) return 8;
    }
}
#endif
